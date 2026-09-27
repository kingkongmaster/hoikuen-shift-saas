const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readRoster } = require('./roster-file-security.cjs');

/** Local rehearsal input only. Production retains the existing read-only Linux mount guard. */
function readFormalPackage(file) {
  if (process.env.DEPLOYMENT_ENV !== 'test') return readRoster(file);
  const stop = () => { throw new Error('SYSTEM_SAFETY_BLOCK:FORMAL_FILE:isolated local file guard failed'); };
  const url = new URL(process.env.DATABASE_URL || 'invalid:');
  if (process.env.TEST_DATABASE_ISOLATED !== 'true' || process.env.NODE_ENV === 'production'
    || !['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || !/(?:^|[_-])(test|testing|isolated)(?:$|[_-])/i.test(url.pathname.slice(1))) stop();
  const resolved = path.resolve(file);
  for (let current = resolved; current !== path.dirname(current); current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink() || fs.existsSync(path.join(current, '.git'))) stop();
  }
  const parent = fs.statSync(path.dirname(resolved));
  if ((parent.mode & 0o777) !== 0o700 || parent.uid !== process.getuid()) stop();
  const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > 2 * 1024 * 1024) stop();
    const bytes = fs.readFileSync(fd);
    if (JSON.parse(bytes.toString('utf8')).packageType !== 'MUSUBI_FORMAL_INPUT_PACKAGE') stop();
    return { bytes, checksum: crypto.createHash('sha256').update(bytes).digest('hex') };
  } finally { fs.closeSync(fd); }
}
module.exports = { readFormalPackage };
