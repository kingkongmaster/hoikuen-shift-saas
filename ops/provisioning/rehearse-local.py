"""Blank, ephemeral local Docker rehearsal. No host DB settings or old artifacts used."""
import hashlib,json,os,secrets,subprocess,sys,time,uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
assert subprocess.check_output(['git','-C',str(ROOT),'status','--porcelain']).strip()==b'', 'clean checkpoint required'
OUT=Path(sys.argv[1]).resolve()
assert str(OUT).startswith('/private/tmp/') and not OUT.is_relative_to(ROOT)
OUT.mkdir(mode=0o700,exist_ok=False)
suffix=uuid.uuid4().hex[:10]
tag='closure-'+suffix
db='aen_closure_isolated_'+suffix
postgres='aen-closure-postgres-'+suffix
network='aen-closure-net-'+suffix
tenant=str(uuid.uuid4())
secret_values=[]
def private(name,values):
    p=OUT/name
    p.write_text('\n'.join(k+'='+str(v) for k,v in values.items())+'\n')
    p.chmod(0o600)
    return str(p)
def run(label,args,stdin=None,ok=True):
    with (OUT/(label+'.log')).open('wb') as log:
        p=subprocess.run(args,input=stdin,stdout=log,stderr=subprocess.STDOUT,cwd=ROOT)
    content=(OUT/(label+'.log')).read_bytes()
    for secret in secret_values:content=content.replace(secret.encode(),b'[REDACTED]')
    (OUT/(label+'.log')).write_bytes(content)
    if ok and p.returncode:raise RuntimeError(label+' failed; exit '+str(p.returncode)+'; inspect private evidence')
    return p.returncode,content
def docker(label,*args,**kw):return run(label,['docker',*args],**kw)
images={kind:'aen-shift-'+kind+':'+tag for kind in ['operations','api','migration','web','backup','restore']}
state={'checkpoint':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'images':images,'database':db,'container':postgres,'network':network,'tenantId':tenant,'phase':'BUILD'}
def save(): (OUT/'state.json').write_text(json.dumps(state,indent=2))
save()
for kind,target in [('operations','operations'),('api','runtime'),('migration','migration')]:
    docker('build-'+kind,'build','--pull=false','--target',target,'-t',images[kind],'apps/api')
    print(kind+' build PASS',flush=True)
docker('build-web','build','--pull=false','-t',images['web'],'apps/web');print('web build PASS',flush=True)
docker('build-backup','build','--pull=false','-t',images['backup'],'ops/postgres-backup');print('backup build PASS',flush=True)
docker('build-restore','build','--pull=false','--build-arg','BACKUP_IMAGE='+images['backup'],'--build-arg','OPERATIONS_IMAGE='+images['operations'],'-f','ops/provisioning/Restore.Dockerfile','-t',images['restore'],'.')
# Build-only test image is not a production/distributed image.
webTestImage='aen-shift-web-build-test:'+tag
docker('build-web-test','build','--pull=false','--target','build','-t',webTestImage,'apps/web')
docker('web-dependency-regression','run','--rm','--pull=never','--network','none','--mount','type=bind,src='+str(ROOT/'apps/web/test/dependency-vulnerability-regression.mjs')+',dst=/app/test/dependency-vulnerability-regression.mjs,readonly',webTestImage,'node','test/dependency-vulnerability-regression.mjs')
docker('api-dependency-regression','run','--rm','--pull=never','--network','none','--mount','type=bind,src='+str(ROOT/'apps/api/test/dependency-vulnerability-regression.cjs')+',dst=/app/test/dependency-vulnerability-regression.cjs,readonly',images['operations'],'node','test/dependency-vulnerability-regression.cjs')
run('backup-state-tests',['python3','ops/postgres-backup/test-status.py'])
docker('guard-tests','run','--rm','--network','none','--mount','type=bind,src='+str(ROOT/'apps/api/test/production-operation-guard.test.cjs')+',dst=/app/test/production-operation-guard.test.cjs,readonly',images['operations'],'node','test/production-operation-guard.test.cjs')
env=os.environ.copy();env['OPERATIONS_TEST_IMAGE']=images['operations']
p=subprocess.run(['python3','apps/api/test/roster-security.container.py'],cwd=ROOT,env=env,capture_output=True)
(OUT/'roster-security.json').write_bytes(p.stdout);assert p.returncode==0,'roster tests failed'
print('guard / roster 8 / backup state tests PASS',flush=True)
state['phase']='REHEARSAL';save()
password=secrets.token_hex(24);jwt=secrets.token_hex(40)
initial='Aa1!'+secrets.token_hex(24);changed='Bb2!'+secrets.token_hex(24)
secret_values.extend([password,jwt,initial,changed])
docker('network','network','create','--internal',network)
pg=private('postgres.env',{'POSTGRES_USER':'aen_owner','POSTGRES_PASSWORD':password,'POSTGRES_DB':db})
docker('postgres-start','run','-d','--pull=never','--name',postgres,'--network',network,'--env-file',pg,'postgres:16-alpine')
for attempt in range(40):
    code,_=docker('pg-ready','exec',postgres,'pg_isready','-U','aen_owner','-d',db,ok=False)
    if code==0:break
    time.sleep(1)
else:raise RuntimeError('PostgreSQL not ready')
url='postgresql://aen_owner:'+password+'@127.0.0.1:5432/'+db
settings={'DATABASE_URL':url,'DEPLOYMENT_ENV':'production','DATABASE_TARGET_ID':db,'CONFIRM_DATABASE_TARGET_ID':db,'DATABASE_TARGET_DATABASE':db,'CONFIRM_DEPLOYMENT_ENV':'production','ALLOW_PRODUCTION_MIGRATION':'true','ALLOW_PRODUCTION_PROVISIONING':'true','PROVISIONING_REHEARSAL':'true','TEST_DATABASE_ISOLATED':'true','PROVISIONING_STATE_DIRECTORY':'/var/lib/aen-shift/provisioning','CONFIRM_PRODUCTION_APPLY':'APPLY_MUSUBI_PRODUCTION_'+tenant,'ALLOW_PRODUCTION_ADMIN_BOOTSTRAP':'true','INITIAL_ADMIN_TENANT_ID':tenant,'INITIAL_ADMIN_EMAIL':'closure-admin@example.invalid','INITIAL_ADMIN_PASSWORD':initial,'INITIAL_ADMIN_DISPLAY_NAME':'Anonymous administrator','INITIAL_TENANT_NAME':'Anonymous closure rehearsal','INITIAL_TENANT_CODE':'closure-'+suffix,'INITIAL_ADMIN_STAFF_MODE':'deferred-link','INITIAL_ADMIN_EMPLOYEE_NUMBER':'S001','ALLOW_PRODUCTION_MUSUBI_IMPORT':'true','CONFIRM_MUSUBI_TENANT_ID':tenant,'CONFIRM_MUSUBI_STAFF_COUNT':'23'}
opsenv=private('operations.env',settings)
base=['run','--rm','--pull=never','--network','container:'+postgres,'--env-file',opsenv]
docker('migrate-deploy',*base,images['migration'],'node','scripts/migration.cjs','deploy')
docker('migrate-status',*base,images['migration'],'node','scripts/migration.cjs','status')
print('blank DB -> migrations PASS',flush=True)
roster='aen-closure-roster-'+suffix;volume='aen-closure-state-'+suffix
docker('roster-volume','volume','create',roster);docker('state-volume','volume','create',volume)
_,mount=docker('roster-mount','volume','inspect','--format','{{.Mountpoint}}',roster);mount=mount.decode().strip()
_,data=docker('anonymous-roster-generate','run','--rm','--pull=never','--network','none','--mount','type=bind,src='+str(ROOT/'apps/api/test/create-musubi-import-rehearsal.cjs')+',dst=/app/test/create-musubi-import-rehearsal.cjs,readonly',images['operations'],'sh','-c','node test/create-musubi-import-rehearsal.cjs /tmp/anonymous-roster.json '+tenant+' >/dev/null && cat /tmp/anonymous-roster.json')
payload=json.loads(data);assert len(payload['staff'])==23 and all(x['displayName']=='非実名試験職員'+x['employeeNumber'] for x in payload['staff'])
docker('roster-permissions','run','--rm','--pull=never','--network','none','-i','--user','0:0','--entrypoint','sh','--mount',f'type=bind,src={mount},dst=/fixture',images['operations'],'-c','cat > /fixture/roster.json; chown 0:20001 /fixture /fixture/roster.json; chmod 750 /fixture; chmod 640 /fixture/roster.json',stdin=data)
opsbase=base+['--cap-drop','ALL','--security-opt','no-new-privileges','--mount',f'type=bind,src={mount},dst=/run/aen-shift-roster,readonly','-v',volume+':/var/lib/aen-shift/provisioning']
for script,args in [('bootstrap-admin.cjs',[]),('import-musubi-beta.cjs',['/run/aen-shift-roster/roster.json']),('apply-musubi-tenant-master.cjs',['--tenant-id',tenant]),('apply-tenant-monthly-package.cjs',['--tenant-id',tenant,'--package','/app/tenant-packages/musubi/monthly-2026-10.cjs'])]:
    for mode in [[],['--apply'],['--verify']]:docker(script+('-'.join(mode) or '-dry'),*opsbase,images['operations'],'node','scripts/'+script,*args,*mode)
    print(script+' dry/apply/verify PASS',flush=True)
docker('verify-before-generate',*opsbase,'-e','EXPECTED_ASSIGNMENT_COUNT=0',images['operations'],'node','scripts/verify-musubi-provisioning.cjs','--tenant-id',tenant,'--month','2026-10')
api='aen-closure-api-'+suffix;state['apiContainer']=api;save()
apiEnv=private('api.env',{'DATABASE_URL':url,'NODE_ENV':'production','DEPLOYMENT_ENV':'production','DATABASE_CONNECT_ON_STARTUP':'true','API_PORT':'3000','JWT_SECRET':jwt,'WEB_ORIGIN':'https://closure.example.invalid','JWT_EXPIRES_IN':'8h','TRUST_PROXY':'1','LOG_LEVEL':'error'})
docker('api-start','run','-d','--pull=never','--name',api,'--network','container:'+postgres,'--env-file',apiEnv,images['api'])
for attempt in range(40):
    code,_=docker('api-ready','exec',api,'node','-e',"fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",ok=False)
    if code==0:break
    time.sleep(1)
else:raise RuntimeError('API not ready')
e2e=private('e2e.env',{'API_BASE_URL':'http://127.0.0.1:3000/api','TEST_DATABASE_ISOLATED':'true','MUSUBI_E2E_LOGIN_ID':'closure-admin@example.invalid','MUSUBI_E2E_INITIAL_PASSWORD':initial,'MUSUBI_E2E_CHANGED_PASSWORD':changed})
docker('generate-confirm','run','--rm','--pull=never','--network','container:'+postgres,'--env-file',e2e,'--mount','type=bind,src='+str(ROOT/'apps/api/test/musubi-october-admin-flow.e2e.cjs')+',dst=/app/test/musubi-october-admin-flow.e2e.cjs,readonly',images['operations'],'node','test/musubi-october-admin-flow.e2e.cjs')
_,verified=docker('verify-after-confirm',*opsbase,'-e','EXPECTED_ASSIGNMENT_COUNT=713',images['operations'],'node','scripts/verify-musubi-provisioning.cjs','--tenant-id',tenant,'--month','2026-10')
state['verification']=json.loads(verified);save();print('generate / admin decision / confirm: 713 PASS',flush=True)
# Security regression uses only this checkpoint's anonymous tests and this fresh local DB.
securityEnv=private('security.env',{'DATABASE_URL':url,'JWT_SECRET':jwt,'TEST_DATABASE_ISOLATED':'true','API_BASE_URL':'http://127.0.0.1:3000/api'})
_,securityResult=docker('security-access','run','--rm','--pull=never','--network','container:'+postgres,'--env-file',securityEnv,'--mount','type=bind,src='+str(ROOT/'apps/api/test')+',dst=/app/test,readonly',images['operations'],'node','test/access-safety-audit.e2e.cjs')
state['security']=json.loads(securityResult);assert state['security']['result']=='AUDIT_COMPLETE'
_,verified=docker('verify-after-security',*opsbase,'-e','EXPECTED_ASSIGNMENT_COUNT=713',images['operations'],'node','scripts/verify-musubi-provisioning.cjs','--tenant-id',tenant,'--month','2026-10')
state['verificationAfterSecurity']=json.loads(verified);save()
print('authentication / authorization / IDOR / mass assignment / Tenant / projection PASS',flush=True)
backupvol='aen-closure-backups-'+suffix;docker('backup-volume','volume','create',backupvol)
backupsettings={'PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'aen_owner','PGPASSWORD':password,'PGDATABASE':db,'BACKUP_ENVIRONMENT':'closure_test','BACKUP_DIRECTORY':'/backups','OFFHOST_COPY_ENABLED':'false'}
backupenv=private('backup.env',backupsettings)
bbase=['run','--rm','--pull=never','--network','container:'+postgres,'--env-file',backupenv,'-v',backupvol+':/backups']
_,output=docker('backup',*bbase,images['backup']);filename=output.decode().strip().split('/')[-1]
assert filename.endswith('.dump')
def monitor(label,ok=True):return docker(label,*bbase,'--entrypoint','sh',images['backup'],'/opt/aen-shift/backup/check-status.sh',ok=ok)
monitor('monitor-success')
restoreenv=private('restore.env',{**backupsettings,'TEST_DATABASE_ISOLATED':'true','VERIFY_MONTH':'2026-10','EXPECTED_STAFF_COUNT':'23','EXPECTED_ASSIGNMENT_COUNT':'713','RESTORE_AUDIT_SCRIPT':'/app/scripts/postgres-restore-audit.cjs','RESTORE_REPORT_PATH':'/backups/restore-report.json','BACKUP_FILE':'/backups/'+filename})
rbase=['run','--rm','--pull=never','--network','container:'+postgres,'--env-file',restoreenv,'-v',backupvol+':/backups']
code,_=docker('restore-intentional-failure',*rbase,'-e','RESTORE_DATABASE=aen_restore_verify_bad_'+suffix,'-e','EXPECTED_STAFF_COUNT=24','-e','RESTORE_CLEANUP_ON_FAILURE=true',images['restore'],ok=False);assert code!=0
assert monitor('monitor-restoration-failure',ok=False)[0]!=0
_,restored=docker('restore-success',*rbase,'-e','RESTORE_DATABASE=aen_restore_verify_good_'+suffix,images['restore'])
monitor('monitor-recovered')
_,report=docker('restore-report','run','--rm','--pull=never','--network','none','-v',backupvol+':/backups:ro','--entrypoint','cat',images['backup'],'/backups/restore-report.json')
state['restore']=json.loads(report);assert state['restore']['migrations']['total']==30
assert all(v==0 for v in state['restore']['tenantBoundaryViolations'].values())
state['phase']='PASS';save();print('backup / monitor / restore / tenant boundary PASS',flush=True)
assert subprocess.check_output(['git','status','--porcelain'],cwd=ROOT).strip()==b''
print('Evidence: '+str(OUT),flush=True)
