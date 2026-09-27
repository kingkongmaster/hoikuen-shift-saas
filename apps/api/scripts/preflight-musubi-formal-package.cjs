const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { readFormalPackage } = require('./lib/formal-package-file.cjs');
const { derivePreflight, productionPreflight, hash } = require('./lib/formal-preflight.cjs');
const execution = require('./lib/formal-execution.cjs');
const executionMode = process.argv.includes('--execution-envelope');
const value = flag => process.argv[process.argv.indexOf(flag) + 1];
async function main() {
  if (process.argv.includes('--apply') || process.argv.includes('--verify')) throw new Error('APPLY_FORBIDDEN');
  for (const flag of ['--input', '--tenant-id', '--parent-sha256']) if (!process.argv.includes(flag)) throw new Error('ARGUMENT_REQUIRED');
  const binding = { targetTenantId: value('--tenant-id'), expectedParentHash: value('--parent-sha256') };
  if (process.argv.includes('--derive')) {
    for (const flag of ['--output', '--approval-reference']) if (!process.argv.includes(flag)) throw new Error('ARGUMENT_REQUIRED');
    const { bytes } = readFormalPackage(value('--input'));
    const input = (executionMode ? execution.deriveExecution : derivePreflight)(bytes, { ...binding, approvalReference: value('--approval-reference'), ...(executionMode ? { adminLinkMode: process.argv.includes('--admin-link-mode') ? value('--admin-link-mode') : undefined, ...(process.argv.includes('--admin-employee-number') ? { adminEmployeeNumber: value('--admin-employee-number') } : {}) } : {}) });
    const file = path.resolve(value('--output')); const directory = path.dirname(file);
    for (let p = directory; p !== path.dirname(p); p = path.dirname(p)) {
      if (fs.lstatSync(p).isSymbolicLink() || fs.existsSync(path.join(p, '.git'))) throw new Error('UNSAFE_OUTPUT');
    }
    const stat = fs.statSync(directory);
    if ((stat.mode & 0o7777) !== 0o700 || stat.uid !== process.getuid()) throw new Error('UNSAFE_OUTPUT');
    const output = Buffer.from(JSON.stringify(input));
    fs.writeFileSync(file, output, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ purpose: input.purpose, sha256: hash(output), size: output.length, parentPackageSha256: binding.expectedParentHash, writes: 0 }));
    return;
  }
  const { bytes, checksum } = readFormalPackage(value('--input'), executionMode ? execution.TYPE : 'MUSUBI_PRODUCTION_PREFLIGHT_INPUT');
  const prisma = new PrismaClient();
  try { console.log(JSON.stringify({ ...await (executionMode ? execution.executionPreflight : productionPreflight)(prisma, JSON.parse(bytes.toString('utf8')), binding), checksum })); }
  finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('SYSTEM_SAFETY_BLOCK:FORMAL_PREFLIGHT:validation or target check failed; no apply performed'); process.exitCode = 1; });
