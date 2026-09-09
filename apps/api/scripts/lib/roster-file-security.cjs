const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const FILE = '/run/aen-shift-roster/roster.json';
const UID = 20001;
const GID = 20001;
function fail(code) { throw new Error(`SYSTEM_SAFETY_BLOCK:ROSTER_${code}:unsafe roster input`); }
function readRoster(file) {
  if (file !== FILE) fail('PATH');
  if (process.platform !== 'linux' || process.getuid() !== UID || process.getgid() !== GID) fail('IDENTITY');
  try {
    for (let p = file; p !== '/'; p = path.dirname(p)) if (fs.lstatSync(p).isSymbolicLink()) fail('SYMLINK');
    const mounts = fs.readFileSync('/proc/self/mountinfo', 'utf8').trim().split('\n').map(line => line.split(' '));
    const mount = mounts.filter(parts => file === parts[4] || file.startsWith(parts[4] + '/')).sort((a,b) => b[4].length-a[4].length)[0];
    if (!mount || !mount[5].split(',').includes('ro') || !['/run/aen-shift-roster', FILE].includes(mount[4])) fail('WRITABLE_MOUNT');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size < 1 || stat.size > 2 * 1024 * 1024 || stat.nlink !== 1) fail('TYPE');
      if (stat.uid !== 0 || stat.gid !== GID || (stat.mode & 0o7777) !== 0o640) fail('OWNER_MODE');
      const bytes = fs.readFileSync(fd);
      return { bytes, checksum: crypto.createHash('sha256').update(bytes).digest('hex') };
    } finally { fs.closeSync(fd); }
  } catch (error) {
    if (error.message.startsWith('SYSTEM_SAFETY_BLOCK:')) throw error;
    fail(error.code === 'ENOENT' ? 'MISSING' : 'UNREADABLE');
  }
}
module.exports = { readRoster, FILE, UID, GID };
