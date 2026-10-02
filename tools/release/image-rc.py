"""Manual public-runner RC. No registry push, production credentials or deployment.

Private scanner findings/build logs never enter artifacts. High/Critical findings
remain UNCLASSIFIED and block RC; this tool does not invent reachability waivers.
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
                rows.append({k: v.get(k) for k in ('VulnerabilityID', 'PkgName', 'InstalledVersion', 'FixedVersion', 'Severity')})
    return {'findings': rows, 'secretCount': secrets, 'unclassified': len(rows), 'pass': not rows and secrets == 0}


def layer_boundary(archive_path):
    counts = {'sourceMaps': 0, 'forbiddenFiles': 0, 'personalContactCandidates': 0}
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
                        counts['personalContactCandidates'] += int(bool(PERSONAL_EMAIL.search(data) or PHONE.search(data)))
    counts['pass'] = not any(counts.values())
    return counts


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
        archives = []
        for app, image in manifest['images'].items():
            archive = output / (app + '.tar')
            command(['docker', 'save', '-o', str(archive), image['imageId']])
            boundary = layer_boundary(archive)
            scan_file = output / (app + '.scan.private.json')
            command([str(scanner), 'image', '--cache-dir', str(cache), '--scanners', 'vuln,secret', '--format', 'json', '--output', str(scan_file), image['imageId']])
            security = vulnerabilities(json.loads(scan_file.read_text()))
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
        report['status'] = 'IMAGE_SECURITY_METADATA_VERIFIED_RUNTIME_NOT_YET_VERIFIED'
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
    return 0 if report['status'].startswith('IMAGE_SECURITY_METADATA_VERIFIED') else 1


if __name__ == '__main__':
    sys.exit(run(*sys.argv[1:]))
