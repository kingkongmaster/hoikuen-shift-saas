"""Private candidate verification, not a GitHub Actions attestation.

Uses the reviewed RC checks against newly built, retained image bytes. No host
packages are installed, Production containers are never addressed for mutation.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import socket
import struct
import subprocess
import sys

SOURCE_SHA = '6d92ae4c4fe5c660627371e62fd7d530dfe1e229'
BUILDER = 'aen-pr37-private-builder'
original_run = subprocess.run


def normalize_checkout(source):
    # Public tracked build inputs need ordinary checkout modes. Confidentiality
    # comes from the root-only release parent, never unreadable runtime assets.
    assert source.parent.stat().st_mode & 0o777 == 0o700
    entries = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=source).split(b'\0')
    for entry in filter(None, entries):
        header, name = entry.split(b'\t', 1)
        mode = header.split()[0]
        assert mode in (b'100644', b'100755'), 'UNREVIEWED_CHECKOUT_FILE_TYPE'
        path = source / os.fsdecode(name)
        assert path.resolve().is_relative_to(source.resolve()) and not path.is_symlink()
        path.chmod(0o755 if mode == b'100755' else 0o644)
        parent = path.parent
        while parent.is_relative_to(source):
            parent.chmod(0o755)
            if parent == source: break
            parent = parent.parent


def invoke(args, **kwargs):
    return original_run(args, **kwargs)


def output(args):
    r = invoke(args, capture_output=True, timeout=1800)
    with Path(os.environ['RC_PRIVATE_LOG']).open('ab') as log:
        log.write(r.stdout + r.stderr)
    if r.returncode:
        raise RuntimeError('PRIVATE_COMMAND_FAILED:' + args[0])
    return r.stdout


def labels(m):
    return dict(zip(['org.opencontainers.image.title', 'org.opencontainers.image.version',
                     'org.opencontainers.image.revision', 'org.opencontainers.image.created',
                     'jp.aen-shift.build-id'], [m['product'], m['releaseId'], m['gitSha'], m['builtAt'], m['buildId']]))


def build(source, metadata_path, manifest_path):
    m = json.loads(Path(metadata_path).read_text())
    assert m['product'] == 'AeN Shift' and m['gitSha'] == SOURCE_SHA[:12]
    if os.environ.get('RC_REUSE_MANIFEST'):
        previous = Path(os.environ['RC_REUSE_MANIFEST'])
        assert str(previous).startswith('/opt/aen-shift/releases/pr37-private-')
        manifest = json.loads(previous.read_text())
        assert manifest['metadata'] == m and manifest['source'] == {'baseSha': SOURCE_SHA, 'dirty': False}
        Path(manifest_path).write_text(json.dumps(manifest, indent=2))
        return
    manifest = {'metadata': m, 'platform': 'linux/amd64', 'source': {'baseSha': SOURCE_SHA, 'dirty': False}, 'images': {}}
    for app in ('api', 'web'):
        tag = 'aen-pr37-private-' + app + ':' + m['buildId'].lower()
        args = ['docker', 'buildx', 'build', '--builder', BUILDER, '--load', '--no-cache', '--platform', 'linux/amd64', '-t', tag]
        for k, v in labels(m).items():
            args += ['--label', k + '=' + v]
        if app == 'api':
            args += ['--target', 'runtime']
        else:
            args += ['--build-arg', 'AEN_RELEASE_METADATA=' + json.dumps(m, separators=(',', ':')),
                     '--build-arg', 'VITE_RELEASE_CHANNEL=musubi-beta', '--build-arg', 'VITE_API_BASE_URL=/api']
        args += [str(source / 'apps' / app)]
        output(args)
        image = json.loads(output(['docker', 'image', 'inspect', tag]))[0]
        assert image['Architecture'] == 'amd64' and image['Os'] == 'linux'
        assert all(image['Config']['Labels'][k] == v for k, v in labels(m).items())
        manifest['images'][app] = {'tag': tag, 'imageId': image['Id'], 'repoDigests': image['RepoDigests'],
            'baseImages': sorted(set(re.findall(r'\S+@sha256:[a-f0-9]{64}', (source / 'apps' / app / 'Dockerfile').read_text())))}
    Path(manifest_path).write_text(json.dumps(manifest, indent=2))


def verify(manifest_path):
    manifest = json.loads(Path(manifest_path).read_text()); m = manifest['metadata']
    for app, row in manifest['images'].items():
        image = json.loads(output(['docker', 'image', 'inspect', row['imageId']]))[0]
        assert all(image['Config']['Labels'][k] == v for k, v in labels(m).items())
        assert image['Architecture'] == 'amd64'
        if app == 'web':
            prefix = ['docker', 'run', '--rm', '--network', 'none', '--memory', '128m', '--cpus', '0.5', '--pids-limit', '64', '--entrypoint']
            raw = output(prefix + ['cat', row['imageId'], '/usr/share/nginx/html/release-metadata.json'])
            assert json.loads(raw) == m
            js = output(prefix + ['sh', row['imageId'], '-c', 'cat /usr/share/nginx/html/assets/*.js'])
            assert all(v.encode() in js for v in m.values())
            assert not re.search(rb'DATABASE_URL|JWT_SECRET|BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY', js)
            assert not output(prefix + ['find', row['imageId'], '/usr/share/nginx/html', '-name', '*.map']).strip()


def undefined_symbols(path):
    """Read ELF64 little-endian DYNSYM directly; fail closed on other formats."""
    raw = Path(path).read_bytes()
    assert raw[:6] == b'\x7fELF\x02\x01'
    offset = struct.unpack_from('<Q', raw, 40)[0]
    size, count = struct.unpack_from('<HH', raw, 58)
    assert size == 64 and offset + size * count <= len(raw)
    sections = [struct.unpack_from('<IIQQQQIIQQ', raw, offset + i * size) for i in range(count)]
    names = []
    for s in sections:
        if s[1] != 11:
            continue
        strings = sections[s[6]]; table = raw[strings[4]:strings[4] + strings[5]]
        assert s[9] == 24
        for at in range(s[4], s[4] + s[5], s[9]):
            name, info, other, index, value, length = struct.unpack_from('<IBBHQQ', raw, at)
            if index == 0 and name:
                names.append(table[name:table.index(b'\0', name)].decode())
    return '\n'.join('UND ' + n for n in names).encode()


def intercepted(args, *pos, **kwargs):
    if args[0] == 'node':
        source = Path(args[1]).parents[2]
        if Path(args[1]).name == 'build-images.mjs': build(source, args[2], args[3])
        elif Path(args[1]).name == 'verify-images.mjs': verify(args[2])
        else: raise RuntimeError('UNEXPECTED_HOST_NODE')
        return subprocess.CompletedProcess(args, 0, b'Private Python build/metadata adapter PASS\n', b'')
    if args[0] == 'readelf':
        return subprocess.CompletedProcess(args, 0, undefined_symbols(args[-1]), b'')
    if args[:2] == ['docker', 'run']:
        args = args[:2] + ['--memory', '512m', '--cpus', '0.5', '--pids-limit', '256'] + args[2:]
    if Path(args[0]).name == 'trivy':
        args = ['systemd-run', '--scope', '--quiet', '-p', 'CPUQuota=50%', '-p', 'MemoryMax=768M', *args]
    return invoke(args, *pos, **kwargs)


if __name__ == '__main__':
    assert socket.gethostname() == 'vm-9b587606-82'
    assert Path('/sys/class/dmi/id/product_uuid').read_text().strip() == 'e2688065-d749-4642-a884-05cce0cba92f'
    source, out = map(Path, sys.argv[1:3]); assert sys.argv[3] == SOURCE_SHA
    assert str(out).startswith('/opt/aen-shift/releases/pr37-private-')
    os.umask(0o077)
    normalize_checkout(source)
    rc = runpy.run_path(str(Path(__file__).with_name('image-rc.py')))
    subprocess.run = intercepted
    try:
        result = rc['run'](source, out, SOURCE_SHA)
    finally:
        subprocess.run = original_run
    report_path = out / 'publish/rc-report.json'
    report = json.loads(report_path.read_text())
    report['executionEnvironment'] = 'private-vps-new-candidate-not-GitHub-Actions-image'
    report['archiveRetention'] = 'private-originals-retained'
    report['hostPackagesInstalled'] = 0
    report['checkoutPermissions'] = 'tracked public inputs 0644/0755 below root-only 0700 release parent'
    report_path.write_text(json.dumps(report, indent=2))
    sys.exit(result)
