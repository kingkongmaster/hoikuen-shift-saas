const { spawnSync } = require('node:child_process');

const action = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const deployment = process.env.DEPLOYMENT_ENV?.trim().toLowerCase();
const target = process.env.DATABASE_TARGET_ID?.trim();

function stop(message) { process.stderr.write(`${message}\n`); process.exit(1); }
if (!['status', 'deploy'].includes(action)) stop('Usage: node scripts/migration.cjs <status|deploy> [--dry-run]');
if (!process.env.DATABASE_URL) stop('DATABASE_URL is required (value is never printed).');
if (!deployment || !target || target.length < 6) stop('DEPLOYMENT_ENV and a descriptive DATABASE_TARGET_ID are required.');
if (process.env.CONFIRM_DATABASE_TARGET_ID?.trim() !== target) stop('Database target confirmation does not match.');
if (process.env.CONFIRM_DEPLOYMENT_ENV?.trim().toLowerCase() !== deployment) stop('Deployment environment confirmation does not match.');
if (deployment === 'production' && process.env.ALLOW_PRODUCTION_MIGRATION !== 'true') stop('Production migration requires ALLOW_PRODUCTION_MIGRATION=true.');

const prismaAction = action === 'deploy' && !dryRun ? 'deploy' : 'status';
if (dryRun) process.stdout.write('Dry-run performs migrate status only; Prisma migrate deploy has no SQL dry-run mode.\n');
const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(executable, ['prisma', 'migrate', prismaAction], { encoding: 'utf8', env: process.env });
const sensitive = [process.env.DATABASE_URL];
try { const parsed = new URL(process.env.DATABASE_URL); sensitive.push(parsed.hostname, decodeURIComponent(parsed.username), decodeURIComponent(parsed.password)); } catch {}
const sanitize = (value) => sensitive.filter(Boolean).reduce((output, secret) => output.split(secret).join('[REDACTED]'), value || '');
if (result.stdout) process.stdout.write(sanitize(result.stdout));
if (result.stderr) process.stderr.write(sanitize(result.stderr));
process.exit(typeof result.status === 'number' ? result.status : 1);
