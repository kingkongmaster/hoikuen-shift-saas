"""Uses only an anonymous disposable bind directory; never a real roster."""
import json,os,subprocess,tempfile
from pathlib import Path
image=os.environ.get('OPERATIONS_TEST_IMAGE','aen-shift-operations:high-fixes-20260908')
import uuid
volume='aen-roster-security-'+uuid.uuid4().hex
subprocess.run(['docker','volume','create',volume],check=True,capture_output=True)
fixture=subprocess.check_output(['docker','volume','inspect','--format','{{.Mountpoint}}',volume],text=True).strip()
def setup(cmd):
    r=subprocess.run(['docker','run','--rm','--pull=never','--network','none','--user','0:0','--entrypoint','sh','--mount',f'type=bind,src={fixture},dst=/fixture',image,'-c',cmd],capture_output=True,text=True)
    assert r.returncode==0,r.stderr

def test(label, expected=None, path='/run/aen-shift-roster/roster.json', readonly=True):
    args=['docker','run','--rm','--pull=never','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',f'type=bind,src={fixture},dst=/run/aen-shift-roster'+(',readonly' if readonly else ''),image,'node','-e',"try { const x=require('./scripts/lib/roster-file-security.cjs').readRoster(process.argv[1]); console.log(JSON.stringify({read:true,checksum:x.checksum})); } catch(e) {console.error(e.message);process.exit(2)}",path]
    r=subprocess.run(args,capture_output=True,text=True)
    assert (r.returncode==0) if expected is None else (r.returncode!=0 and expected in r.stderr),(label,r.stderr)
    results.append(label)
results=[]
setup('printf anonymous > /fixture/roster.json; chown 0:20001 /fixture /fixture/roster.json; chmod 750 /fixture; chmod 640 /fixture/roster.json')
test('A safe 640 read-only bind')
setup('chmod 644 /fixture/roster.json');test('B world-readable rejected','OWNER_MODE')
setup('chmod 640 /fixture/roster.json');test('C writable bind rejected','WRITABLE_MOUNT',readonly=False)
test('D unexpected path rejected','ROSTER_PATH',path='/tmp/roster.json')
setup('mv /fixture/roster.json /fixture/source.json; ln -s source.json /fixture/roster.json');test('E symlink rejected','SYMLINK')
setup('rm /fixture/roster.json');test('F missing file rejected','MISSING')
setup('mv /fixture/source.json /fixture/roster.json; chown 20001:20001 /fixture/roster.json');test('unexpected owner rejected','OWNER_MODE')
setup('chown 0:20001 /fixture/roster.json; chmod 660 /fixture/roster.json');test('group writable rejected','OWNER_MODE')
print(json.dumps({'pass':True,'tests':results},indent=2))

subprocess.run(['docker','volume','rm',volume],check=True,capture_output=True)
