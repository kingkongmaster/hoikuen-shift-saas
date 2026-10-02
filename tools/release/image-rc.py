"""Manual public-runner RC. No registry push, production credentials or deployment.

Private scanner findings/build logs never enter artifacts. High/Critical findings
require exact, expiring, source-pinned reachability evidence; unknown findings block RC.
"""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time
import secrets
import urllib.request

MAX_ARTIFACT_BYTES = 400 * 1024 * 1024
TRIVY_URL = 'https://github.com/aquasecurity/trivy/releases/download/v0.75.0/trivy_0.75.0_Linux-64bit.tar.gz'
TRIVY_SHA256 = 'c6e65abddb348e25f10549df887045629cf28cc72453cd1c63acb717316b3f3f'
FORBIDDEN_PATH = re.compile(r'(^|/)(?:\.env(?:\..*)?|[^/]*\.(?:docx?|xlsx?|pdf|dump|backup|sqlite3?|pem|p12|pfx|key))$|formal-pii|recovery-archive', re.I)
PERSONAL_EMAIL = re.compile(rb'[A-Z0-9._%+-]+@(?:gmail\.com|ymail\.ne\.jp|yahoo\.co\.jp|icloud\.com)', re.I)
PHONE = re.compile(rb'(?<![0-9])0[789]0[- ][0-9]{4}[- ][0-9]{4}(?![0-9])')


def sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def vulnerabilities(document):
    if not isinstance(document.get('Results'), list):
        raise ValueError('INVALID_SECURITY_REPORT')
    rows = []
    secrets = 0
    for result in document.get('Results', []):
        secrets += len(result.get('Secrets', []))
        for v in result.get('Vulnerabilities', []):
            if v.get('Severity') in ('HIGH', 'CRITICAL', 'UNKNOWN'):
                rows.append({**{k: v.get(k) for k in ('VulnerabilityID', 'PkgName', 'InstalledVersion', 'FixedVersion', 'Severity', 'Layer')}, 'target': result.get('Target')})
    return {'findings': rows, 'secretCount': secrets, 'unclassified': len(rows), 'pass': not rows and secrets == 0}


def layer_boundary(archive_path, public_contact=None):
    counts = {'sourceMaps': 0, 'forbiddenFiles': 0, 'personalContactCandidates': 0, 'publicContactFiles': 0}
    contacts = []
    absent = {'untgz': True}
    with tarfile.open(archive_path) as archive:
        manifests = json.load(archive.extractfile('manifest.json'))
        if len(manifests) != 1 or not manifests[0].get('Layers'):
            raise ValueError('INVALID_IMAGE_ARCHIVE')
        for name in dict.fromkeys(manifests[0]['Layers']):
            with tarfile.open(fileobj=archive.extractfile(name), mode='r|*') as layer:
                for entry in layer:
                    if entry.isdir():
                        continue
                    path = entry.name.lstrip('./')
                    if Path(path).name == 'untgz': absent['untgz'] = False
                    counts['sourceMaps'] += int(path.endswith('.map'))
                    # System TLS CA bundles are not private credentials. Application
                    # originals, env files, private keys and database files are forbidden.
                    app_owned = path.startswith(('app/dist/', 'usr/share/nginx/html/'))
                    if path.startswith('app/') or app_owned:
                        counts['forbiddenFiles'] += int(bool(FORBIDDEN_PATH.search(path)))
                    if app_owned and entry.isfile():
                        if entry.size > 64 * 1024 * 1024:
                            raise ValueError('UNINSPECTED_OVERSIZED_APPLICATION_FILE')
                        data = layer.extractfile(entry).read()
                        matches = PERSONAL_EMAIL.findall(data) + PHONE.findall(data)
                        if matches:
                            public = public_contact is not None and all(m == public_contact for m in matches)
                            counts['personalContactCandidates'] += int(not public)
                            counts['publicContactFiles'] += int(public)
                            contacts.append({'path': path, 'layer': name, 'category': 'PUBLIC_BUSINESS_CONTACT' if public else 'UNCLASSIFIED'})
    counts['pass'] = not any(counts[k] for k in ('sourceMaps', 'forbiddenFiles', 'personalContactCandidates'))
    counts['contactEvidence'] = contacts
    counts['absentExecutables'] = absent
    return counts


def source_fingerprint(source):
    paths = ['apps/api/src', 'apps/api/prisma', 'apps/api/package.json', 'apps/api/package-lock.json',
             'apps/api/migration', 'apps/api/Dockerfile', 'apps/web/src', 'apps/web/package.json',
             'apps/web/package-lock.json', 'apps/web/Dockerfile', 'apps/web/nginx.conf', 'apps/web/docker-entrypoint.d']
    files = subprocess.check_output(['git', 'ls-files', *paths], cwd=source).decode().splitlines()
    digest = hashlib.sha256()
    for name in sorted(files):
        digest.update(name.encode() + b'\0' + hashlib.sha256((source / name).read_bytes()).digest())
    return digest.hexdigest()


def public_legal_contact(source):
    contacts = []
    for name in ('apps/api/src/presentation/setup/legal-documents.ts', 'apps/web/src/features/legal/legal-documents.ts'):
        data = (source / name).read_bytes()
        found = re.search(rb'"contact":\s*"([^"\n]+)"', data)
        if not found or b'aen-terms-r1-v1' not in data or b'aen-privacy-r1-v1' not in data:
            raise ValueError('PUBLIC_LEGAL_CONTACT_NOT_VERIFIED')
        contacts.append(found[1])
    if contacts[0] != contacts[1]:
        raise ValueError('LEGAL_CONTACT_MISMATCH')
    return contacts[0]


def classify(scan, scope, policy, guards):
    rows = {(r['scope'], r['VulnerabilityID'], r['PkgName'], r['InstalledVersion']): r for r in policy['rows']}
    valid = guards and datetime.date.today().isoformat() <= policy['expiresAt']
    for finding in scan['findings']:
        key = (scope, finding['VulnerabilityID'], finding['PkgName'], finding['InstalledVersion'])
        rule = rows.get(key) if valid else None
        if rule and rule['Severity'] == finding['Severity'] and rule['category'] in ('RUNTIME_REACHABLE_BLOCKER', 'RUNTIME_REACHABLE_MITIGATED', 'BUILD_ONLY', 'DEV_ONLY', 'OS_PACKAGE_NOT_REACHABLE', 'FALSE_POSITIVE') and rule['assessedSeverity'] in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'):
            finding.update({k: rule[k] for k in ('category', 'assessedSeverity', 'reason', 'exploitCondition', 'reference')})
        else:
            finding['category'] = 'UNKNOWN'
    scan['unclassified'] = sum(f['category'] == 'UNKNOWN' for f in scan['findings'])
    scan['runtimeBlockers'] = sum(f['category'] == 'RUNTIME_REACHABLE_BLOCKER' for f in scan['findings'])
    scan['pass'] = valid and not (scan['unclassified'] or scan['runtimeBlockers'] or scan['secretCount'])
    return scan


def runtime_evidence(command, manifest, source, result):
    # Anonymous, disposable runner-only network: no host port, no external routing.
    suffix = os.environ.get('GITHUB_RUN_ID', 'local')
    network, db, api, web = ['rc-' + x + '-' + suffix for x in ('net', 'db', 'api', 'web')]
    created = []
    def run_container(name, args):
        command(['docker', 'run', '-d', '--name', name, '--network', network, *args])
        created.append(name)
    try:
        result['phase'] = 'pull-isolated-postgres'
        command(['docker', 'pull', '--platform', 'linux/amd64', 'postgres:16-alpine'])
        result['isolatedPostgresImageId'] = json.loads(command(['docker', 'image', 'inspect', 'postgres:16-alpine'], capture=True))[0]['Id']
        command(['docker', 'network', 'create', '--internal', network])
        result['phase'] = 'start-isolated-postgres'
        run_container(db, ['--network-alias', 'db', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=rc', 'postgres:16-alpine'])
        for attempt in range(30):
            ready = subprocess.run(['docker', 'exec', db, 'pg_isready', '-U', 'postgres'], capture_output=True)
            if ready.returncode == 0: break
            time.sleep(1)
        else: raise ValueError('ISOLATED_POSTGRES_NOT_READY')
        # Synthetic secret only; never copied into artifact or command output.
        os.environ['RC_TEST_JWT'] = secrets.token_hex(40)
        result['phase'] = 'start-api'
        run_container(api, ['--network-alias', 'api', '-e', 'DATABASE_URL=postgresql://postgres@db:5432/rc',
            '-e', 'JWT_SECRET=' + os.environ.pop('RC_TEST_JWT'), '-e', 'JWT_EXPIRES_IN=15m', '-e', 'NODE_ENV=production',
            '-e', 'DEPLOYMENT_ENV=staging', '-e', 'WEB_ORIGIN=https://rc.example.invalid', '-e', 'TRUST_PROXY=1', '-e', 'LOG_LEVEL=error',
            manifest['images']['api']['imageId']])
        result['phase'] = 'start-web'
        run_container(web, ['-e', 'API_UPSTREAM=http://api:3000', manifest['images']['web']['imageId']])
        probe = """(async()=>{const paths=['http://api:3000/api/health','http://api:3000/api/ready'];for(const url of paths){let ok=false;for(let i=0;i<30;i++){try{ok=(await fetch(url)).status===200}catch{}if(ok)break;await new Promise(r=>setTimeout(r,1000))}if(!ok)throw Error('HEALTH')};const form=new FormData();form.append('probe','anonymous');const r=await fetch('http://api:3000/api/auth/login',{method:'POST',body:form});if(![400,401].includes(r.status))throw Error('MULTIPART_REJECTION');console.log(JSON.stringify({health:200,readiness:200,multipartRejected:true}))})().catch(()=>process.exit(1))"""
        result['phase'] = 'api-health-readiness-multipart'
        result['api'] = json.loads(command(['docker', 'exec', api, 'node', '-e', probe], capture=True))
        # Node probe in the API container reaches only this internal Web container.
        paths = ['/', '/manifest.json', '/sw.js', '/icons/aen-shift-icon-192.png', '/icons/aen-shift-icon-512.png', '/release-metadata.json']
        web_probe = "(async()=>{for(const p of " + json.dumps(paths) + "){const r=await fetch('http://" + web + ":8080'+p);if(r.status!==200)throw Error('WEB_HTTP');if(p==='/release-metadata.json'&&JSON.stringify(await r.json())!==JSON.stringify(" + json.dumps(manifest['metadata']) + "))throw Error('WEB_METADATA')}console.log(JSON.stringify({http:200,pwa:200,metadataMatch:true}))})().catch(()=>process.exit(1))"
        result['phase'] = 'web-http-pwa-metadata'
        result['web'] = json.loads(command(['docker', 'exec', api, 'node', '-e', web_probe], capture=True))
        result['phase'] = 'nginx-config'
        config = command(['docker', 'exec', web, 'nginx', '-T'], capture=True)
        result['phase'] = 'nginx-linked-libraries'
        ldd = command(['docker', 'exec', web, 'ldd', '/usr/sbin/nginx'], capture=True)
        result['nginxEvidence'] = {'effectiveConfigurationSha256': hashlib.sha256(config.encode()).hexdigest(),
            'linkedLibraries': sorted(set(re.findall(r'lib[\w.+-]+\.so[\w.-]*', ldd))),
            'excludedFeatureDirectives': not re.search(r'^\s*(?:image_filter|xslt_stylesheet|xslt_types|ssl_certificate|ssl_crl|http2|quic)\b|listen[^;]*(?:ssl|http2|quic)|proxy_pass\s+https:', config, re.M),
            'staticHttpUpstream': 'proxy_pass http://api:3000/api/;' in config}
        result['phase'] = 'deepmerge-absence'
        result['api']['deepmergeAbsent'] = command(['docker', 'exec', api, 'node', '-e', "try{require.resolve('deepmerge-ts');process.exit(1)}catch(e){if(e.code!=='MODULE_NOT_FOUND')process.exit(1);console.log('absent')}"], capture=True).strip() == 'absent'
        result['phase'] = 'nginx-process'
        result['web']['nginxOnlyProcess'] = all('nginx:' in line for line in command(['docker', 'top', web, '-eo', 'args'], capture=True).splitlines()[1:])
        result['amd64'] = all(json.loads(command(['docker','image','inspect',x['imageId']],capture=True))[0]['Architecture']=='amd64' for x in manifest['images'].values())
        for name in (api, web):
            state = json.loads(command(['docker', 'inspect', '--format', '{{json .State}}', name], capture=True))
            if not state['Running'] or state.get('OOMKilled'): raise ValueError('RUNTIME_STATE')
            if command(['docker', 'inspect', '--format', '{{.RestartCount}}', name], capture=True).strip() != '0': raise ValueError('RUNTIME_RESTART')
        result['phase'] = 'complete'
        result['restartCount'] = 0
        result['internalNetwork'] = True
        result['productionConnected'] = False
        result['pass'] = result['api']['deepmergeAbsent'] and result['web']['nginxOnlyProcess'] and result['amd64'] and result['nginxEvidence']['excludedFeatureDirectives'] and result['nginxEvidence']['staticHttpUpstream'] and not re.search(r'libcares|libnghttp2', ldd)
        return result
    finally:
        result['containerDiagnostics'] = []
        for name in created:
            state = subprocess.run(['docker', 'inspect', '--format', '{{json .State}}', name], capture_output=True)
            if state.returncode == 0:
                data = json.loads(state.stdout)
                logs = subprocess.run(['docker', 'logs', name], capture_output=True)
                text = (logs.stdout + logs.stderr).decode(errors='replace')
                result['containerDiagnostics'].append({'role': name.split('-')[1], 'running': data.get('Running'),
                    'exitCode': data.get('ExitCode'), 'oomKilled': data.get('OOMKilled'),
                    'errorSignals': {label: label in text for label in ('Invalid production environment', 'Cannot find module', 'ECONNREFUSED', 'Error', 'FATAL')}})
        for name in reversed(created):
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
        subprocess.run(['docker', 'network', 'rm', network], capture_output=True)


def artifact_size_ok(paths):
    return sum(Path(p).stat().st_size for p in paths) <= MAX_ARTIFACT_BYTES


def run(source, output, expected_sha):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not re.fullmatch('[0-9a-f]{40}', expected_sha):
        raise ValueError('INVALID_FIXED_SHA')
    if output.exists():
        raise ValueError('NEW_OUTPUT_DIRECTORY_REQUIRED')
    output.mkdir(mode=0o700, parents=True)
    publish = output / 'publish'
    publish.mkdir(mode=0o700)
    report = {'sourceSha': expected_sha, 'status': 'HOLD', 'productionConnected': False,
              'sourcePiiReview': 'HUMAN_REVIEW_REQUIRED_AT_DISPATCH', 'images': {}}
    log = output / 'private-run.log'

    def command(args, cwd=None, capture=False):
        result = subprocess.run(args, cwd=cwd, capture_output=True, timeout=1800)
        # Retained only in ephemeral runner. Never artifact or stdout raw logs.
        with log.open('ab') as f:
            f.write(result.stdout + result.stderr)
        if result.returncode:
            raise ValueError('COMMAND_FAILED_' + Path(args[0]).name)
        return result.stdout.decode() if capture else None

    try:
        actual = command(['git', 'rev-parse', 'HEAD'], cwd=source, capture=True).strip()
        if actual != expected_sha or command(['git', 'status', '--porcelain'], cwd=source, capture=True).strip():
            raise ValueError('SOURCE_SHA_OR_CLEAN_GATE')
        if os.environ.get('GITHUB_REPOSITORY') != 'kingkongmaster/hoikuen-shift-saas':
            raise ValueError('WRONG_REPOSITORY')
        for key in ('DATABASE_URL', 'PRODUCTION_DATABASE_URL', 'SSH_PRIVATE_KEY', 'JWT_SECRET'):
            if os.environ.get(key):
                raise ValueError('CREDENTIAL_ENV_FORBIDDEN')
        (source.parent / 'source-manifest.json').write_text(json.dumps({'baseSha': expected_sha, 'dirty': False}))
        stamp = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
        metadata = {'product': 'AeN Shift', 'releaseId': 'musubi-r1-pilot-' + expected_sha[:12],
                    'buildId': stamp.strftime('%Y%m%dT%H%M%SZ') + '-' + expected_sha[:12] + '-' + os.environ.get('GITHUB_RUN_ID', 'local'),
                    'gitSha': expected_sha[:12], 'builtAt': stamp.isoformat().replace('+00:00', 'Z')}
        metadata_file = output / 'metadata.json'
        metadata_file.write_text(json.dumps(metadata))
        scanner_archive = output / 'trivy.tar.gz'
        urllib.request.urlretrieve(TRIVY_URL, scanner_archive)
        if sha(scanner_archive) != TRIVY_SHA256:
            raise ValueError('SCANNER_CHECKSUM_MISMATCH')
        scanner = output / 'trivy'
        with tarfile.open(scanner_archive) as archive:
            entry = archive.getmember('trivy')
            if not entry.isfile():
                raise ValueError('INVALID_SCANNER')
            scanner.write_bytes(archive.extractfile(entry).read())
        scanner.chmod(0o700)
        report['scanner'] = {'version': '0.75.0', 'sha256': TRIVY_SHA256, 'freshDatabase': True}
        # No shared Actions cache. Vulnerability DB is fetched into this run only.
        cache = output / 'scanner-cache'
        source_scan = output / 'source-scan.private.json'
        command([str(scanner), 'fs', '--cache-dir', str(cache), '--scanners', 'vuln,secret', '--format', 'json', '--output', str(source_scan), str(source / 'apps')])
        report['sourceSecurity'] = vulnerabilities(json.loads(source_scan.read_text()))
        manifest_file = output / 'manifest.json'
        command(['node', str(source / 'tools/release/build-images.mjs'), str(metadata_file), str(manifest_file)])
        command(['node', str(source / 'tools/release/verify-images.mjs'), str(manifest_file)])
        manifest = json.loads(manifest_file.read_text())
        policy = json.loads((source / 'tools/release/image-security-policy.json').read_text())
        fingerprint_ok = source_fingerprint(source) == policy['sourceFingerprint']
        if not fingerprint_ok: raise ValueError('REACHABILITY_SOURCE_CHANGED')
        public_contact = public_legal_contact(source)
        report['stage'] = 'isolated-runtime'
        report['runtime'] = {}
        runtime_evidence(command, manifest, source, report['runtime'])
        guards = report['runtime']['pass']
        report['sourceSecurity'] = classify(report['sourceSecurity'], 'source', policy, guards)
        archives = []
        for app, image in manifest['images'].items():
            report['stage'] = 'image-scan-' + app
            archive = output / (app + '.tar')
            command(['docker', 'save', '-o', str(archive), image['imageId']])
            boundary = layer_boundary(archive, public_contact)
            scan_file = output / (app + '.scan.private.json')
            command([str(scanner), 'image', '--cache-dir', str(cache), '--scanners', 'vuln,secret', '--format', 'json', '--output', str(scan_file), image['imageId']])
            security = classify(vulnerabilities(json.loads(scan_file.read_text())), app, policy, guards and boundary['absentExecutables']['untgz'])
            detail = json.loads(command(['docker', 'image', 'inspect', image['imageId']], capture=True))[0]
            compressed = output / (app + '.tar.gz')
            with archive.open('rb') as src, gzip.open(compressed, 'wb', compresslevel=6) as dst:
                shutil.copyfileobj(src, dst)
            archives.append(compressed)
            report['images'][app] = {**image, 'layers': detail['RootFS']['Layers'], 'boundary': boundary,
                                     'security': security, 'archiveBytes': compressed.stat().st_size,
                                     'archiveSha256': sha(compressed)}
        report['metadata'] = metadata
        report['securityGate'] = all(v['security']['pass'] and v['boundary']['pass'] for v in report['images'].values()) and report['sourceSecurity']['pass']
        report['artifactSizeGate'] = artifact_size_ok(archives) and sum(x.stat().st_size for x in archives) < MAX_ARTIFACT_BYTES - 1024 * 1024
        if not report['securityGate']:
            raise ValueError('SECURITY_OR_CONTENT_REVIEW_REQUIRED')
        if not report['artifactSizeGate']:
            raise ValueError('ARTIFACT_COST_SIZE_HOLD')
        for archive in archives:
            shutil.move(str(archive), publish / archive.name)
        report['status'] = 'IMAGE_SECURITY_METADATA_RUNTIME_VERIFIED'
    except Exception as error:
        report['reason'] = str(error) if isinstance(error, ValueError) else type(error).__name__
    finally:
        # Only allowlisted scalar metadata, counts and vulnerability identifiers.
        (publish / 'rc-report.json').write_text(json.dumps(report, indent=2))
        if not artifact_size_ok(publish.iterdir()):
            for artifact in publish.iterdir():
                artifact.unlink()
            raise ValueError('ARTIFACT_COST_SIZE_HOLD')
    print(json.dumps({'status': report['status'], 'reason': report.get('reason'), 'sourceSha': expected_sha}))
    return 0 if report['status'].startswith('IMAGE_SECURITY_METADATA_RUNTIME_VERIFIED') else 1


if __name__ == '__main__':
    sys.exit(run(*sys.argv[1:]))
