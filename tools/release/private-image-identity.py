"""Verify retained archive, config, every rootfs layer, and same-engine reload.

Only unique PR37 candidate tags may be loaded; never address a Production tag.
"""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile


def digest(stream):
    h = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
    return 'sha256:' + h.hexdigest()


def verify(stage, archive_dir):
    report = json.loads((stage / 'candidate-report.json').read_text())
    assert report['securityGate'] and report['sourceSha'] == '6d92ae4c4fe5c660627371e62fd7d530dfe1e229'
    assert stage.stat().st_mode & 0o777 == 0o700
    results = {}
    for app, row in report['images'].items():
        assert app in ('api', 'web') and row['tag'].startswith('aen-pr37-private-' + app + ':')
        archive = archive_dir / (app + '.tar.gz')
        assert archive.stat().st_mode & 0o777 == 0o600 and archive.stat().st_uid == 0
        with archive.open('rb') as f: actual_sha = digest(f)[7:]
        assert actual_sha == row['archiveSha256'] and archive.stat().st_size == row['archiveBytes']
        image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', row['imageId']]))[0]
        assert image['Id'] == row['imageId'] and image['RootFS']['Layers'] == row['layers']
        with tarfile.open(archive, 'r:gz') as outer:
            manifests = json.load(outer.extractfile('manifest.json'))
            matching = []
            for manifest in manifests:
                raw = outer.extractfile(manifest['Config']).read()
                config = json.loads(raw)
                if config.get('rootfs', {}).get('diff_ids') == row['layers']:
                    matching.append((manifest, config, 'sha256:' + hashlib.sha256(raw).hexdigest()))
            assert len(matching) == 1, 'ARCHIVE_RUNTIME_CONFIG_NOT_UNIQUE'
            manifest, config, config_sha = matching[0]
            assert config['config']['Labels']['org.opencontainers.image.revision'] == report['sourceSha'][:12]
            assert len(manifest['Layers']) == len(row['layers'])
            for name, expected in zip(manifest['Layers'], row['layers']):
                stream = outer.extractfile(name)
                magic = stream.read(2); stream.seek(0)
                assert digest(gzip.GzipFile(fileobj=stream) if magic == b'\x1f\x8b' else stream) == expected
            descriptor = image.get('Descriptor', {}).get('digest', row['imageId'])
            if row['imageId'] != config_sha:
                blob = 'blobs/sha256/' + descriptor[7:]
                assert digest(outer.extractfile(blob)) == descriptor, 'DESCRIPTOR_NOT_RETAINED'
        # Same original bytes, no rebuild or normalization. Candidate tag only.
        loaded = subprocess.run(['docker', 'load', '-i', str(archive)], capture_output=True, timeout=180)
        assert loaded.returncode == 0, 'CANDIDATE_RELOAD_FAILED'
        reloaded = json.loads(subprocess.check_output(['docker', 'image', 'inspect', row['tag']]))[0]
        assert reloaded['Id'] == row['imageId'] and reloaded['RootFS']['Layers'] == row['layers'], 'RELOAD_IDENTITY_CHANGED'
        results[app] = {'archiveSha256': actual_sha, 'archiveBytes': row['archiveBytes'], 'imageId': row['imageId'],
            'descriptorDigest': descriptor, 'configDigest': config_sha, 'layers': row['layers'],
            'sameImageAfterLoad': True, 'allLayerDiffIdsMatch': True, 'permissions': '0600 root', 'registryRepoDigests': reloaded['RepoDigests']}
    result = {'status': 'PASS', 'sourceSha': report['sourceSha'], 'images': results, 'productionSwitch': False}
    (stage / 'retained-identity.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__': verify(Path(sys.argv[1]), Path(sys.argv[2]))
