const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readFormalPackage } = require('../scripts/lib/formal-package-file.cjs');
const saved = {...process.env};
const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'aen-file-guard-'));
fs.chmodSync(directory,0o700);
const file = path.join(directory,'anonymous.json');
fs.writeFileSync(file,JSON.stringify({packageType:'MUSUBI_FORMAL_INPUT_PACKAGE'}),{mode:0o600});
try {
  Object.assign(process.env,{DATABASE_URL:'postgresql://local@127.0.0.1/aen_test',TEST_DATABASE_ISOLATED:'true',DEPLOYMENT_ENV:'test',NODE_ENV:'test'});
  assert.match(readFormalPackage(file).checksum,/^[a-f0-9]{64}$/);
  fs.chmodSync(file,0o644);assert.throws(()=>readFormalPackage(file));fs.chmodSync(file,0o600);
  fs.chmodSync(directory,0o755);assert.throws(()=>readFormalPackage(file));fs.chmodSync(directory,0o700);
  const link=path.join(directory,'link.json');fs.symlinkSync(file,link);assert.throws(()=>readFormalPackage(link));
  fs.mkdirSync(path.join(directory,'.git'));assert.throws(()=>readFormalPackage(file));fs.rmdirSync(path.join(directory,'.git'));
  for (const url of ['postgresql://local@remote.invalid/aen_test','postgresql://local@localhost/production','https://localhost/aen_test']) {process.env.DATABASE_URL=url;assert.throws(()=>readFormalPackage(file));}
  process.env.DATABASE_URL='postgresql://local@127.0.0.1/aen_test';
  process.env.DEPLOYMENT_ENV='production';assert.throws(()=>readFormalPackage(file),/ROSTER_PATH/,'production retains original mount guard');
  console.log('Formal package file guard PASS: owner/mode, Git exclusion, symlink, local isolated DB, production guard retained');
} finally {
  process.env=saved;fs.rmSync(directory,{recursive:true});
}
