"""Read-only source dependency and privacy audit; reports contain paths, never values."""
import hashlib,json,re,shlex,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
files={p.relative_to(root).as_posix():p for p in root.rglob('*') if p.is_file() and '.git' not in p.relative_to(root).parts}
edges=[];issues=[]
def edge(origin,target,kind):
    target=target.resolve()
    if not target.is_relative_to(root) or not target.exists():
        issues.append({'file':origin,'kind':'missing-'+kind,'target':str(target.relative_to(root)) if target.is_relative_to(root) else 'outside-root'})
    else:edges.append({'from':origin,'to':target.relative_to(root).as_posix(),'kind':kind})
def local(origin,value):
    target=files[origin].parent/value
    options=[target]+[Path(str(target)+s) for s in ['.ts','.tsx','.js','.cjs','.json','.d.ts']]+[target/'index.ts',target/'index.tsx']
    found=next((p for p in options if p.is_file()),target)
    edge(origin,found,'import')
for name,p in files.items():
    if p.is_symlink():issues.append({'file':name,'kind':'symlink'})
    if re.search(r'(^|/)(node_modules|dist|fixtures|__pycache__)(/|$)|ai-shared|\.pdf$|\.(dump|backup|sqlite3?|db|xlsx|numbers|pem|key|p12|pfx|log|pyc|tsbuildinfo)$',name,re.I):issues.append({'file':name,'kind':'forbidden-artifact'})
    if p.name.startswith('.env') and not p.name.endswith('.example'):issues.append({'file':name,'kind':'actual-env'})
    data=p.read_bytes()
    if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk-proj-[A-Za-z0-9_-]{40,}',data):issues.append({'file':name,'kind':'credential-signature'})
    if re.search(rb'postgres(?:ql)?://[^\s\x27\x22/:]+:[^\s\x27\x22@$\{]+@',data):issues.append({'file':name,'kind':'literal-db-credential'})
    try:s=data.decode()
    except UnicodeDecodeError:continue
    if p.suffix in ('.ts','.tsx','.js','.cjs','.mjs'):
        for value in re.findall(r'(?:require\s*\(\s*|from\s+|import\s+)[\x27\x22](\.[^\x27\x22]+)[\x27\x22]',s):local(name,value)
    if p.suffix=='.sh':
        for value in re.findall(r'\$SCRIPT_DIRECTORY/([a-zA-Z0-9_.-]+\.(?:sh|py))',s):edge(name,p.parent/value,'shell')
    if p.name=='Dockerfile' or p.name.endswith('.Dockerfile'):
        context=root if p.name=='Restore.Dockerfile' else p.parent
        for line in s.splitlines():
            if not line.startswith('COPY ') or '--from=' in line:continue
            terms=shlex.split(line)[1:];sources=[x for x in terms[:-1] if not x.startswith('--')]
            for value in sources:
                matches=[context] if value in ('.','./') else list(context.glob(value))
                if not matches:edge(name,context/value,'COPY')
                for match in matches:edge(name,match,'COPY')
    if p.name=='production-migrations.json':
        manifest=json.loads(s);assert len(manifest)==30
        for item in manifest:
            q=root/'apps/api/prisma/migrations'/item['name']/'migration.sql';edge(name,q,'migration')
            if q.is_file() and hashlib.sha256(q.read_bytes()).hexdigest()!=item['checksum']:issues.append({'file':name,'kind':'migration-checksum'})
    if p.name.startswith('tsconfig') and p.suffix=='.json':
        obj=json.loads(s)
        for item in obj.get('references',[]):edge(name,p.parent/item['path'],'tsconfig')
    if p.suffix=='.json':
        obj=json.loads(s)
        if isinstance(obj,dict) and (obj.get('packageType')=='MUSUBI_BETA_STAFF_IMPORT' or isinstance(obj.get('staff'),list)):issues.append({'file':name,'kind':'roster-payload'})
edge('compose.musubi-beta.yaml',root/'deploy/musubi-beta/Caddyfile','compose')
for name in ['apps/api/package.json','apps/web/package.json']:
    package=json.loads(files[name].read_text())
    for command,value in package['scripts'].items():
        # Only invoked production entrypoints and included impact tests are closure roots.
        if command.startswith('test:') and not any(x in value for x in ['production-operation-guard.test.cjs','musubi-october-admin-flow.e2e.cjs','access-safety-audit.e2e.cjs','dependency-vulnerability-regression.cjs']):continue
        if command in ['db:seed','demo:preflight','setup:musubi-provisional','import:staff:analyze','audit:fair-special-shifts']:continue
        for target in re.findall(r'\bnode\s+([a-zA-Z0-9_./-]+\.(?:cjs|js))',value):
            if target.startswith('dist/'):continue
            edge(name,files[name].parent/target,'package-script')
report={'pass':not issues,'sourceFileCount':len(files),'dependencyEdges':edges,'issues':issues,'files':{n:hashlib.sha256(p.read_bytes()).hexdigest() for n,p in sorted(files.items())},'scope':'Production build/runtime/operations and targeted rehearsal. Non-invoked legacy package scripts are not entrypoints. Generated compiler outputs are build products, not checkpoint inputs.'}
if len(sys.argv)>1:
    out=Path(sys.argv[1]).resolve();assert not out.is_relative_to(root);out.write_text(json.dumps(report,indent=2))
print(json.dumps({'pass':report['pass'],'sourceFileCount':len(files),'edgeCount':len(edges),'issues':issues},indent=2))
raise SystemExit(0 if not issues else 1)
