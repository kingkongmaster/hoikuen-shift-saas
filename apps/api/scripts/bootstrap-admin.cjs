const { PrismaClient, EmploymentType, MembershipRole, SubscriptionPlan, SubscriptionStatus } = require('@prisma/client');
const { randomBytes, scryptSync } = require('node:crypto');
const { assertEnvironment, assertDatabaseSafety, recordDryRun, packageDigest } = require('./lib/production-operation-guard.cjs');

const prisma = new PrismaClient();
function stop(message) { process.stderr.write(`${message}\n`); process.exitCode = 1; }
function hash(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }

async function main() {
  const apply = process.argv.includes('--apply');
  const verifyOnly = process.argv.includes('--verify');
  const mode = verifyOnly ? 'VERIFY' : apply ? 'APPLY' : 'DRY_RUN';
  const deployment = process.env.DEPLOYMENT_ENV?.trim().toLowerCase();
  if (!deployment) throw new Error('DEPLOYMENT_ENV is required.');
  if (deployment === 'production' && process.env.ALLOW_PRODUCTION_ADMIN_BOOTSTRAP !== 'true') throw new Error('Production bootstrap requires ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=true.');
  const tenantId = process.env.INITIAL_ADMIN_TENANT_ID?.trim();
  if (!/^[0-9a-f-]{36}$/i.test(tenantId || '')) throw new Error('INITIAL_ADMIN_TENANT_ID must be an explicit UUID.');
  const operation = 'tenant-admin-bootstrap';
  if (verifyOnly) {
    assertEnvironment({ tenantId, operation, mode, packageDigest: '' });
    await assertDatabaseSafety(prisma, tenantId);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { memberships: { where: { role: MembershipRole.ADMIN, isActive: true }, include: { user: true } } } });
    const pass = Boolean(tenant && tenant.memberships.length === 1 && tenant.memberships[0].user.mustChangePassword);
    process.stdout.write(`${JSON.stringify({ pass, tenantId, activeAdministrators: tenant?.memberships.length ?? 0, mustChangePassword: tenant?.memberships[0]?.user.mustChangePassword === true })}\n`);
    if (!pass) process.exitCode = 1;
    return;
  }
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const displayName = process.env.INITIAL_ADMIN_DISPLAY_NAME?.trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid INITIAL_ADMIN_EMAIL is required.');
  if (!password || password !== password.trim() || password.length < 12 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) throw new Error('INITIAL_ADMIN_PASSWORD must be supplied securely, contain 12 to 128 characters, and include uppercase, lowercase, number, and symbol characters.');
  if (!displayName) throw new Error('INITIAL_ADMIN_DISPLAY_NAME is required.');
  if (password.toLowerCase() === email.toLowerCase() || password.toLowerCase() === displayName.toLowerCase()) throw new Error('INITIAL_ADMIN_PASSWORD must not match the administrator email or display name.');
  const guard = assertEnvironment({ tenantId, operation, mode, packageDigest: packageDigest({ tenantId, email, displayName, tenantCode: process.env.INITIAL_TENANT_CODE, employeeNumber: process.env.INITIAL_ADMIN_EMPLOYEE_NUMBER }) });
  await assertDatabaseSafety(prisma, tenantId, { requireTenant: false });
  if (!apply) {
    const [tenant, existingUser] = await Promise.all([prisma.tenant.findUnique({ where: { id: tenantId }, include: { memberships: { where: { role: MembershipRole.ADMIN, isActive: true } } } }), prisma.user.findUnique({ where: { email } })]);
    if (tenant?.memberships.length) throw new Error('An active administrator already exists for the tenant.');
    if (existingUser) throw new Error('A user with this email already exists.');
    process.stdout.write(`${JSON.stringify({ mode, tenantId, tenantAction: tenant ? 'USE_EXISTING' : 'CREATE_EXPLICIT_ID', administratorAction: 'CREATE', credentialsPrinted: false })}\n`);
    recordDryRun(operation, tenantId, guard);
    return;
  }

  await prisma.$transaction(async (tx) => {
    let tenant;
    if (tenantId) tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      const name = process.env.INITIAL_TENANT_NAME?.trim(); const code = process.env.INITIAL_TENANT_CODE?.trim().toLowerCase();
      if (!name || !code) throw new Error('Specify INITIAL_TENANT_NAME and INITIAL_TENANT_CODE when creating the explicit Tenant UUID.');
      const staffLimit = Number(process.env.INITIAL_TENANT_STAFF_LIMIT || '23');
      if (!Number.isInteger(staffLimit) || staffLimit < 23) throw new Error('INITIAL_TENANT_STAFF_LIMIT must be an integer of at least 23.');
      tenant = await tx.tenant.create({ data: { id: tenantId, name, displayName: name, code } });
      const now = new Date();
      await tx.tenantSubscription.create({ data: { tenantId: tenant.id, plan: SubscriptionPlan.TRIAL, status: SubscriptionStatus.TRIAL, trialStartedAt: now, trialEndsAt: new Date(now.getTime() + 30 * 86400000), staffLimit } });
    }
    const activeAdministrator = await tx.membership.findFirst({ where: { tenantId: tenant.id, role: MembershipRole.ADMIN, isActive: true } });
    if (activeAdministrator) throw new Error('An active administrator already exists for the tenant.');
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) throw new Error('A user with this email already exists.');
    const user = await tx.user.create({ data: { loginId: email, email, displayName, passwordHash: hash(password), isActive: true, mustChangePassword: true } });
    await tx.membership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, update: { role: MembershipRole.ADMIN, isActive: true }, create: { tenantId: tenant.id, userId: user.id, role: MembershipRole.ADMIN } });
    const staffMode = process.env.INITIAL_ADMIN_STAFF_MODE?.trim() || 'create';
    if (!['create', 'deferred-link'].includes(staffMode)) throw new Error('INITIAL_ADMIN_STAFF_MODE must be create or deferred-link.');
    if (staffMode === 'deferred-link' && !process.env.INITIAL_ADMIN_EMPLOYEE_NUMBER?.trim()) throw new Error('Deferred administrator linking requires INITIAL_ADMIN_EMPLOYEE_NUMBER.');
    if (staffMode === 'create') await tx.staff.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, update: { displayName, email, isActive: true }, create: { tenantId: tenant.id, userId: user.id, employeeNumber: process.env.INITIAL_ADMIN_EMPLOYEE_NUMBER ?? 'ADMIN-001', displayName, email, jobTitle: '管理者', employmentType: EmploymentType.FULL_TIME } });
    await tx.auditLog.create({ data: { tenantId: tenant.id, memberId: user.id, action: 'INITIAL_ADMIN_CREATED', targetType: 'User', targetId: user.id, detail: { source: 'bootstrap-admin-cli', mustChangePassword: true, ...(staffMode === 'deferred-link' ? { staffMode, pendingEmployeeNumber: process.env.INITIAL_ADMIN_EMPLOYEE_NUMBER.trim() } : {}) } } });
  });
  process.stdout.write('Initial administrator created successfully. Credentials were not printed.\n');
}

const safeErrors = [/^SYSTEM_SAFETY_BLOCK:/, /^DEPLOYMENT_ENV is required/, /^Production bootstrap requires/, /^A valid INITIAL_ADMIN_EMAIL/, /^INITIAL_ADMIN_PASSWORD/, /^INITIAL_ADMIN_DISPLAY_NAME/, /^INITIAL_ADMIN_TENANT_ID/, /^Specify INITIAL_TENANT_NAME/, /^INITIAL_TENANT_STAFF_LIMIT/, /^An active administrator already exists/, /^A user with this email already exists/, /^INITIAL_ADMIN_STAFF_MODE/, /^Deferred administrator linking/];
main().catch((error) => { const message = error instanceof Error ? error.message : ''; stop(safeErrors.some((pattern) => pattern.test(message)) ? message : 'Initial administrator creation failed.'); }).finally(() => prisma.$disconnect());
