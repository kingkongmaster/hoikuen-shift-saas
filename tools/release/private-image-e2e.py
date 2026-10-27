"""Start only retained, verified PR37 images with a fresh anonymous database.

No published ports or Production networks. Reach these IPs through existing SSH
local forwards; browser/API tests never receive Production credentials or data.
"""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time

SCOPE = 'pr37-anonymous-e2e'
NETWORK = 'aen-pr37-e2e-net'
NAMES = ['aen-pr37-e2e-postgres', 'aen-pr37-e2e-api', 'aen-pr37-e2e-web']


def call(args, raw=None):
    r = subprocess.run(args, input=raw, capture_output=True, timeout=90)
    if r.returncode:
        raise RuntimeError('ISOLATED_COMMAND_FAILED:' + args[0])
    return r.stdout


def inspect(name):
    return json.loads(call(['docker', 'inspect', name]))[0]


def cleanup():
    for name in reversed(NAMES):
        r = subprocess.run(['docker', 'inspect', name], capture_output=True)
        if r.returncode == 0:
            assert json.loads(r.stdout)[0]['Config']['Labels'].get('jp.aen-shift.scope') == SCOPE
            call(['docker', 'rm', '-f', '-v', name])
    r = subprocess.run(['docker', 'network', 'inspect', NETWORK], capture_output=True)
    if r.returncode == 0:
        network = json.loads(r.stdout)[0]
        assert network['Labels'].get('jp.aen-shift.scope') == SCOPE and not network['Containers']
        call(['docker', 'network', 'rm', NETWORK])


def start(stage, postgres_image):
    report = json.loads((stage / 'candidate-report.json').read_text())
    assert report['sourceSha'] == '6d92ae4c4fe5c660627371e62fd7d530dfe1e229'
    assert report['securityGate'] and report['status'] == 'IMAGE_SECURITY_METADATA_RUNTIME_VERIFIED'
    for name in NAMES + [NETWORK]:
        r = subprocess.run(['docker', 'inspect', name], capture_output=True)
        assert r.returncode != 0, 'ISOLATION_NAME_ALREADY_EXISTS'
    created = []
    call(['docker', 'network', 'create', '--internal', '--label', 'jp.aen-shift.scope=' + SCOPE, NETWORK])
    try:
        def run(name, memory, cpus, options, image):
            call(['docker', 'run', '-d', '--name', name, '--network', NETWORK,
                  '--label', 'jp.aen-shift.scope=' + SCOPE, '--memory', memory,
                  '--cpus', cpus, '--pids-limit', '256', *options, image])
            created.append(name)
        pg, api, web = NAMES
        run(pg, '256m', '0.5', ['--network-alias', 'postgres', '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456',
            '-e', 'PGDATA=/var/lib/postgresql/data/pgdata', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
            '-e', 'POSTGRES_DB=pr37_isolated_test', '-e', 'TZ=Asia/Tokyo'], postgres_image)
        for _ in range(30):
            if subprocess.run(['docker', 'exec', pg, 'psql', '-h', '127.0.0.1', '-U', 'postgres',
                               '-d', 'pr37_isolated_test', '-Atqc', 'SELECT 1'], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('ISOLATED_DB_NOT_READY')
        migrations = sorted((stage / 'source/apps/api/prisma/migrations').glob('*/migration.sql'))
        assert len(migrations) == 30
        for migration in migrations:
            call(['docker', 'exec', '-i', pg, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'pr37_isolated_test'], migration.read_bytes())
        call(['docker', 'exec', pg, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
              '-c', "ALTER DATABASE pr37_isolated_test SET timezone TO 'Asia/Tokyo';"])
        run(api, '512m', '0.75', ['--network-alias', 'api', '-e', 'DATABASE_URL=postgresql://postgres@postgres:5432/pr37_isolated_test',
            '-e', 'JWT_SECRET=' + secrets.token_hex(48), '-e', 'JWT_EXPIRES_IN=1h', '-e', 'NODE_ENV=production',
            '-e', 'DEPLOYMENT_ENV=staging', '-e', 'WEB_ORIGIN=https://rc.example.invalid', '-e', 'TRUST_PROXY=1', '-e', 'LOG_LEVEL=error'], report['images']['api']['imageId'])
        run(web, '128m', '0.25', ['--network-alias', 'web', '-e', 'API_UPSTREAM=http://api:3000'], report['images']['web']['imageId'])
        records = {}
        for role, name in zip(['postgres', 'api', 'web'], NAMES):
            state = inspect(name)
            assert list(state['NetworkSettings']['Networks']) == [NETWORK]
            assert not state['HostConfig']['PortBindings']
            assert state['State']['Running'] and not state['State']['OOMKilled']
            records[role] = {'name': name, 'imageId': state['Image'], 'ip': state['NetworkSettings']['Networks'][NETWORK]['IPAddress'],
                'memoryLimit': state['HostConfig']['Memory'], 'publishedPorts': 0}
        assert records['api']['imageId'] == report['images']['api']['imageId']
        assert records['web']['imageId'] == report['images']['web']['imageId']
        network = json.loads(call(['docker', 'network', 'inspect', NETWORK]))[0]
        assert network['Internal'] and len(network['Containers']) == 3
        (stage / 'e2e-environment.json').write_text(json.dumps({'internalNetwork': True, 'containers': records,
            'existingMigrationsAppliedOnlyToAnonymousDB': len(migrations), 'productionConnected': False}, indent=2))
        print(json.dumps({'status': 'ISOLATED_IMAGES_STARTED', 'containers': records, 'productionConnected': False}))
    except Exception:
        cleanup()
        raise


if __name__ == '__main__':
    assert socket.gethostname() == 'vm-9b587606-82'
    os.umask(0o077)
    if sys.argv[1] == 'cleanup': cleanup()
    else: start(Path(sys.argv[1]), sys.argv[2])
