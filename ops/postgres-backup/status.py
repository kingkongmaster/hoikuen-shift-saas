#!/usr/bin/env python3
"""Private, atomic backup run records. Never source status files as shell code."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import uuid
import fcntl

UTC = dt.timezone.utc

def now():
    return dt.datetime.now(UTC).isoformat()

def root():
    p = Path(os.environ['BACKUP_DIRECTORY'])
    if not p.is_absolute() or str(p) == '/' or p.is_symlink():
        raise ValueError('unsafe status directory')
    p = p / 'status'
    p.mkdir(parents=True, exist_ok=True, mode=0o700)
    if p.is_symlink():
        raise ValueError('unsafe status directory')
    return p

def read(p):
    if p.is_symlink():
        raise ValueError('symlink status record')
    if not p.exists():
        return None
    v = json.loads(p.read_text())
    required = {'version', 'runId', 'kind', 'status', 'startedAt', 'finishedAt', 'exitCode', 'filename', 'checksum', 'restoreVerification'}
    if not isinstance(v, dict) or not required.issubset(v) or v['version'] != 1 or v['status'] not in ('STARTED', 'SUCCESS', 'FAILURE') or v['kind'] not in ('backup', 'restore'):
        raise ValueError('invalid status record')
    if v['restoreVerification'] not in ('NOT_RUN', 'PENDING', 'PASS', 'FAIL'):
        raise ValueError('invalid restore status')
    if v['kind'] == 'restore' and v['status'] == 'SUCCESS' and v['restoreVerification'] != 'PASS':
        raise ValueError('inconsistent restore success')
    uuid.UUID(v['runId'])
    dt.datetime.fromisoformat(v['startedAt'])
    if v['status'] != 'STARTED':
        dt.datetime.fromisoformat(v['finishedAt'])
        if type(v['exitCode']) is not int or (v['status'] == 'SUCCESS') != (v['exitCode'] == 0):
            raise ValueError('inconsistent status')
    return v

def write(p, v):
    fd, name = tempfile.mkstemp(prefix='.status-', dir=p.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(v, f, sort_keys=True)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, p)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def check(p):
    latest = read(p/'latest-backup.json')
    success = read(p/'last-success.json')
    failure = read(p/'last-failure.json')
    restore = read(p/'latest-restore.json')
    if restore and restore['status'] != 'SUCCESS':
        raise ValueError('restore verification failed or unfinished')
    if latest:
        if latest['status'] != 'SUCCESS':
            raise ValueError('latest backup failed or unfinished')
        if not success or latest['runId'] != success['runId']:
            raise ValueError('latest success record is incomplete')
        if failure and failure['runId'] == latest['runId']:
            raise ValueError('conflicting success and failure for same run')
    elif failure:
        raise ValueError('failure present without authoritative latest run')
    elif not success:
        raise ValueError('no successful backup record')
    completed = dt.datetime.fromisoformat(success['finishedAt'])
    age = (dt.datetime.now(UTC)-completed).total_seconds()
    if age < 0 or age > int(os.environ.get('BACKUP_MAX_AGE_SECONDS', '93600')):
        raise ValueError('no successful backup within 26 hours')
    if not success['filename'] or Path(success['filename']).name != success['filename']:
        raise ValueError('invalid backup generation')
    archive = p.parent/success['filename']
    if archive.is_symlink() or not archive.is_file():
        raise ValueError('backup generation missing')
    with archive.open('rb') as f:
        h = hashlib.sha256()
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
        digest = h.hexdigest()
    if digest != success['checksum']:
        raise ValueError('backup checksum mismatch')
    print('backup status healthy')

def main():
    p = root()
    with (p/'.status.lock').open('a') as lock:
        os.chmod(p/'.status.lock', 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        command = sys.argv[1]
        if command == 'check':
            check(p)
            return
        kind = sys.argv[2]
        if kind not in ('backup', 'restore'):
            raise ValueError('invalid operation kind')
        latest_path = p/f'latest-{kind}.json'
        if command == 'start':
            previous = read(latest_path)
            if previous and previous['status'] == 'STARTED':
                raise ValueError('previous run unfinished; operator recovery required')
            v = dict(version=1, runId=str(uuid.uuid4()), kind=kind, status='STARTED', startedAt=now(), finishedAt=None, exitCode=None, filename=None, checksum=None, restoreVerification='PENDING' if kind == 'restore' else 'NOT_RUN')
            write(latest_path, v)
            print(v['runId'])
        elif command == 'finish':
            v = read(latest_path)
            if not v or v['runId'] != sys.argv[3] or v['status'] != 'STARTED':
                raise ValueError('run identity/state mismatch')
            code = int(sys.argv[4])
            v.update(status='SUCCESS' if code == 0 else 'FAILURE', finishedAt=now(), exitCode=code, filename=Path(sys.argv[5]).name if len(sys.argv)>5 and sys.argv[5] else None, checksum=sys.argv[6] if len(sys.argv)>6 else None)
            if kind == 'restore':
                v['restoreVerification'] = 'PASS' if code == 0 else 'FAIL'
            # Latest remains STARTED until all completion records are durable.
            if kind == 'backup':
                write(p/('last-success.json' if code == 0 else 'last-failure.json'), v)
            write(latest_path, v)
        else:
            raise ValueError('invalid status operation')

try:
    main()
except Exception:
    print('SYSTEM_SAFETY_BLOCK:BACKUP_STATUS:failed, unknown, stale or inconsistent backup/restore state', file=sys.stderr)
    sys.exit(2)
