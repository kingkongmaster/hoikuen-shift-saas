const { PrismaClient, EmploymentType, MembershipRole, SubscriptionPlan, SubscriptionStatus } = require('@prisma/client');
const { randomBytes, scryptSync } = require('node:crypto');

const prisma = new PrismaClient();
function stop(message) { process.stderr.write(`${message}\n`); process.exitCode = 1; }
function hash(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }

async function main() {
  const deployment = process.env.DEPLOYMENT_ENV?.trim().toLowerCase();
  if (!deployment) throw new Error('DEPLOYMENT_ENV is required.');
  if (deployment === 'production' && process.env.ALLOW_PRODUCTION_ADMIN_BOOTSTRAP !== 'true') throw new Error('Production bootstrap requires ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=true.');
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const displayName = process.env.INITIAL_ADMIN_DISPLAY_NAME?.trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid INITIAL_ADMIN_EMAIL is required.');
  if (!password || password.length < 12) throw new Error('INITIAL_ADMIN_PASSWORD must be supplied securely and contain at least 12 characters.');
  if (!displayName) throw new Error('INITIAL_ADMIN_DISPLAY_NAME is required.');

  await prisma.$transaction(async (tx) => {
    let tenant;
    if (process.env.INITIAL_ADMIN_TENANT_ID) tenant = await tx.tenant.findUnique({ where: { id: process.env.INITIAL_ADMIN_TENANT_ID } });
    else {
      const name = process.env.INITIAL_TENANT_NAME?.trim(); const code = process.env.INITIAL_TENANT_CODE?.trim().toLowerCase();
      if (!name || !code) throw new Error('Specify INITIAL_ADMIN_TENANT_ID or INITIAL_TENANT_NAME and INITIAL_TENANT_CODE.');
      tenant = await tx.tenant.create({ data: { name, displayName: name, code } });
      const now = new Date();
      await tx.tenantSubscription.create({ data: { tenantId: tenant.id, plan: SubscriptionPlan.TRIAL, status: SubscriptionStatus.TRIAL, trialStartedAt: now, trialEndsAt: new Date(now.getTime() + 30 * 86400000), staffLimit: 20 } });
    }
    if (!tenant) throw new Error('Specified tenant was not found.');
    const activeAdministrator = await tx.membership.findFirst({ where: { tenantId: tenant.id, role: MembershipRole.ADMIN, isActive: true } });
    if (activeAdministrator) throw new Error('An active administrator already exists for the tenant.');
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) throw new Error('A user with this email already exists.');
    const user = await tx.user.create({ data: { email, displayName, passwordHash: hash(password), isActive: true } });
    await tx.membership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, update: { role: MembershipRole.ADMIN, isActive: true }, create: { tenantId: tenant.id, userId: user.id, role: MembershipRole.ADMIN } });
    await tx.staff.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, update: { displayName, email, isActive: true }, create: { tenantId: tenant.id, userId: user.id, employeeNumber: process.env.INITIAL_ADMIN_EMPLOYEE_NUMBER ?? 'ADMIN-001', displayName, email, jobTitle: '管理者', employmentType: EmploymentType.FULL_TIME } });
    await tx.auditLog.create({ data: { tenantId: tenant.id, memberId: user.id, action: 'INITIAL_ADMIN_CREATED', targetType: 'User', targetId: user.id, detail: { source: 'bootstrap-admin-cli' } } });
  });
  process.stdout.write('Initial administrator created successfully. Credentials were not printed.\n');
}

const safeErrors = [/^DEPLOYMENT_ENV is required/, /^Production bootstrap requires/, /^A valid INITIAL_ADMIN_EMAIL/, /^INITIAL_ADMIN_PASSWORD/, /^INITIAL_ADMIN_DISPLAY_NAME/, /^Specify INITIAL_ADMIN_TENANT_ID/, /^Specified tenant was not found/, /^An active administrator already exists/, /^A user with this email already exists/];
main().catch((error) => { const message = error instanceof Error ? error.message : ''; stop(safeErrors.some((pattern) => pattern.test(message)) ? message : 'Initial administrator creation failed.'); }).finally(() => prisma.$disconnect());
