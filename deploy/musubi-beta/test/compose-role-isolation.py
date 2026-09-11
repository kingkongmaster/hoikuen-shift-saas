import os,re,json,subprocess
from pathlib import Path
src=Path('compose.musubi-beta.yaml').read_text()
env=dict(os.environ)
for key in re.findall(r'\$\{([A-Z_]+)',src): env[key]='test-placeholder'
for key in ['POSTGRES_PASSWORD_FILE','BACKUP_PGPASS_FILE']: env[key]='/dev/null'
for key in ['AEN_SHIFT_API_IMAGE','AEN_SHIFT_WEB_IMAGE','AEN_SHIFT_MIGRATION_IMAGE','AEN_SHIFT_OPERATIONS_IMAGE','AEN_SHIFT_BACKUP_IMAGE']: env[key]='test-image:local'
env.update(DATABASE_URL='postgresql://aen_app@postgres/aen_test',MIGRATION_DATABASE_URL='postgresql://aen_migrator@postgres/aen_test',OPERATIONS_DATABASE_URL='postgresql://aen_app@postgres/aen_test',BACKUP_RETENTION_COUNT='7',READINESS_DB_TIMEOUT_MS='3000')
p=subprocess.run(['docker','compose','--profile','*','--env-file','/dev/null','-f','compose.musubi-beta.yaml','config','--format','json'],env=env,capture_output=True,text=True)
assert p.returncode==0,'compose validation failed'
c=json.loads(p.stdout)['services']
assert c['api']['environment']['DATABASE_URL']==env['DATABASE_URL']
# Profile services are present in resolved config.
assert c['migrate']['environment']['DATABASE_URL']==env['MIGRATION_DATABASE_URL']
assert c['operations']['environment']['DATABASE_URL']==env['OPERATIONS_DATABASE_URL']
for name in ['web','edge','migrate','operations']:
 assert 'JWT_SECRET' not in c[name].get('environment',{})
for name in ['web','edge']:
 assert not any('DATABASE' in x for x in c[name].get('environment',{}))
for name in ['api','web','migrate','operations']:
 assert not c[name].get('secrets'),name
assert c['api']['environment']['RELEASE_CHANNEL']=='musubi-beta'
print('Compose process/role/secret isolation PASS')
