import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid

script = Path(__file__).with_name('status.py')
now = dt.datetime.now(dt.timezone.utc).isoformat()
passed = []
def record(status, kind='backup'):
    return dict(version=1, runId=str(uuid.uuid4()), kind=kind, status=status, startedAt=now, finishedAt=now if status!='STARTED' else None, exitCode=0 if status=='SUCCESS' else 1 if status=='FAILURE' else None, filename='anonymous.dump', checksum=hashlib.sha256(b'anonymous').hexdigest(), restoreVerification='FAIL' if kind=='restore' and status=='FAILURE' else 'NOT_RUN')
def case(name, records, expected, corrupt=False, archive=b'anonymous'):
    with tempfile.TemporaryDirectory() as tmp:
        p=Path(tmp); (p/'status').mkdir(); (p/'anonymous.dump').write_bytes(archive)
        for filename,value in records.items():
            f=p/'status'/filename; f.write_text(json.dumps(value)); os.utime(f,(1000000,1000000))
        if corrupt: (p/'status/latest-backup.json').write_text('{broken')
        r=subprocess.run(['python3',str(script),'check'],env={**os.environ,'BACKUP_DIRECTORY':tmp},capture_output=True)
        assert (r.returncode==0)==expected, (name,r.stderr.decode())
        passed.append(name)
s=record('SUCCESS'); f=record('FAILURE')
case('A success only',{'last-success.json':s},True)
case('B failure only',{'last-failure.json':f},False)
case('C success then failure',{'last-success.json':s,'last-failure.json':f,'latest-backup.json':f},False)
case('D failure then success, identical timestamps',{'last-success.json':s,'last-failure.json':f,'latest-backup.json':s},True)
case('E ambiguous identical timestamps',{'last-success.json':s,'last-failure.json':f},False)
case('E conflicting same run',{'last-success.json':s,'latest-backup.json':s,'last-failure.json':{**f,'runId':s['runId']}},False)
old='2020-01-01T00:00:00+00:00'
case('F old failure new success',{'last-success.json':s,'last-failure.json':{**f,'finishedAt':old},'latest-backup.json':s},True)
case('G new failure old success',{'last-success.json':{**s,'finishedAt':old},'last-failure.json':f,'latest-backup.json':f},False)
case('H corrupt status',{'last-success.json':s},False,corrupt=True)
case('I checksum failure',{'last-success.json':s,'latest-backup.json':s},False,archive=b'corrupted')
case('J restore failure',{'last-success.json':s,'latest-backup.json':s,'latest-restore.json':record('FAILURE','restore')},False)
case('26 hours stale',{'last-success.json':{**s,'finishedAt':old},'latest-backup.json':{**s,'finishedAt':old}},False)
case('started incomplete',{'last-success.json':s,'latest-backup.json':record('STARTED')},False)
case('unknown missing',{},False)
with tempfile.TemporaryDirectory() as tmp:
    env={**os.environ,'BACKUP_DIRECTORY':tmp}
    def call(*args):return subprocess.run(['python3',str(script),*args],env=env,capture_output=True,text=True)
    first=call('start','backup');assert first.returncode==0
    assert call('start','backup').returncode!=0
    assert call('finish','backup',str(uuid.uuid4()),'0').returncode!=0
    assert call('finish','backup',first.stdout.strip(),'1').returncode==0
    second=call('start','backup');assert second.returncode==0 and second.stdout!=first.stdout
    passed.append('run identity / concurrent start / wrong finish')
print(json.dumps({'pass':True,'cases':passed},indent=2))
