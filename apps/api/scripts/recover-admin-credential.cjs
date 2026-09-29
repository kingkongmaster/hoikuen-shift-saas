// Operations only. Never log input, credentials, or raw database errors.
const { PrismaClient } = require('@prisma/client');
const { PasswordService } = require('../dist/application/auth/password.service');
const guard = require('./lib/production-operation-guard.cjs');
const passwords = new PasswordService();
const operation = 'admin-credential-recovery';
function reject() { throw new Error('RECOVERY_GATE_FAILED'); }
function validateTarget(t) {
  if (!t || !/^[0-9a-f-]{36}$/i.test(t.tenantId || '') || !/^[0-9a-f-]{36}$/i.test(t.userId || '') || !Number.isSafeInteger(t.expectedTokenVersion) || t.expectedTokenVersion < 0 || typeof t.expectedMustChangePassword !== 'boolean' || !/^[A-Za-z0-9_-]{8,100}$/.test(t.approvalReference || '') || typeof t.email !== 'string' || !t.email.includes('@')) reject();
}
async function target(db, t) {
  const u = await db.user.findUnique({ where: { id: t.userId }, include: { memberships: true, staff: { select: { id: true } } } });
  if (!u || !u.isActive || u.isPlatformAdmin || u.email !== t.email || u.tokenVersion !== t.expectedTokenVersion || u.mustChangePassword !== t.expectedMustChangePassword || u.staff.length !== 0 || u.memberships.length !== 1) reject();
  const m = u.memberships[0];
  if (m.tenantId !== t.tenantId || !m.isActive || m.role !== 'ADMIN') reject();
  return u;
}
async function recover(db, input, apply = false) {
  validateTarget(input?.target);
  const t = input.target;
  const context = guard.assertEnvironment({ tenantId: t.tenantId, operation, mode: apply ? 'APPLY' : 'DRY_RUN', packageDigest: guard.packageDigest(t), adminLinkMode: 'DEFERRED' });
  if (apply && context.production && process.env.CONFIRM_ADMIN_RECOVERY !== t.approvalReference) reject();
  await guard.assertDatabaseSafety(db, t.tenantId);
  const u = await target(db, t);
  if (typeof input.password !== 'string' || input.password !== input.confirmPassword || passwords.validateNewPassword(input.password, u) || await passwords.verify(input.password, u.passwordHash)) reject();
  if (!apply) { guard.recordDryRun(operation, t.tenantId, context); return; }
  const passwordHash = await passwords.hash(input.password);
  await db.$transaction(async tx => {
    const current = await target(tx, t);
    if (current.passwordHash !== u.passwordHash) reject();
    const updated = await tx.user.updateMany({ where: { id: t.userId, isActive: true, tokenVersion: t.expectedTokenVersion, mustChangePassword: t.expectedMustChangePassword, passwordHash: u.passwordHash }, data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } } });
    if (updated.count !== 1) reject();
    // memberId is the affected User FK, NOT a claim of user self-service.
    await tx.auditLog.create({ data: { tenantId: t.tenantId, memberId: t.userId, action: 'ADMIN_CREDENTIAL_RECOVERED', targetType: 'User', targetId: t.userId, detail: { source: 'admin-credential-recovery-cli', actorKind: 'HUMAN_APPROVED_OPERATIONS', approvalReference: t.approvalReference, affectedUserIsActor: false, mustChangePassword: true, priorTokenVersion: t.expectedTokenVersion, tokenVersion: t.expectedTokenVersion + 1, staffMode: 'deferred-link' } } });
  }, { isolationLevel: 'Serializable' });
}
async function main() {
  if (process.argv.length !== 3 || !['--dry-run', '--apply'].includes(process.argv[2]) || process.stdin.isTTY) reject();
  let data = ''; for await (const chunk of process.stdin) { data += chunk; if (Buffer.byteLength(data) > 8192) reject(); }
  let input; try { input = JSON.parse(data); } catch { reject(); }
  data = '';
  const db = new PrismaClient({ log: [] });
  try { await recover(db, input, process.argv[2] === '--apply'); console.log(process.argv[2] === '--apply' ? 'RECOVERY_APPLY_PASS' : 'RECOVERY_DRY_RUN_PASS'); }
  finally { input.password = input.confirmPassword = undefined; await db.$disconnect(); }
}
if (require.main === module) main().catch(() => { console.error('RECOVERY_HOLD: gate or transaction failed; do not retry; inspect state read-only.'); process.exitCode = 1; });
module.exports = { recover };
