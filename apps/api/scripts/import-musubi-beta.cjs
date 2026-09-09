const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { assertEnvironment, assertDatabaseSafety, recordDryRun } = require('./lib/production-operation-guard.cjs');

const { readRoster } = require('./lib/roster-file-security.cjs');
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const verifyOnly = process.argv.includes('--verify');
const inputArg = process.argv.find((value, index) => index > 1 && !value.startsWith('--'));
const workspaceRoot = path.resolve(__dirname, '../../..');
const allowedEmployment = new Set(['FULL_TIME', 'PART_TIME', 'REEMPLOYED']);
const allowedClass = new Set(['AGE_0', 'AGE_1', 'AGE_2', 'AGE_3', 'AGE_4', 'AGE_5', 'FREE', 'SUPPORT']);

function stop(message) { const error = new Error(message); error.safe = true; throw error; }
function outsideWorkspace(file) { const resolved = path.resolve(file); return resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`); }
function text(value, field, max) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) stop(`${field} is invalid.`); return value.trim(); }
function optionalTime(value, field) { if (value == null) return null; if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) stop(`${field} must be HH:mm or null.`); return value; }
function boolean(value, field) { if (typeof value !== 'boolean') stop(`${field} must be boolean.`); return value; }

function loadInput() {
  if (!inputArg) stop('Usage: node scripts/import-musubi-beta.cjs <git-external-input.json> [--apply|--verify]');
  if (!outsideWorkspace(inputArg)) stop('Input must remain outside the Git workspace.');
  const { bytes, checksum } = readRoster(inputArg);
  let input;
  try { input = JSON.parse(bytes.toString('utf8')); } catch { stop('SYSTEM_SAFETY_BLOCK:ROSTER_JSON:invalid JSON'); }
  if (input.schemaVersion !== 1 || input.packageType !== 'MUSUBI_BETA_STAFF_IMPORT') stop('Unsupported import package.');
  if (input.productionUseApproved !== true) stop('productionUseApproved=true is required in the separately approved Git-external package.');
  if (!/^[0-9a-f-]{36}$/i.test(input.tenantId || '')) stop('tenantId must be an explicit UUID.');
  if (!Array.isArray(input.staff) || input.staff.length !== 23) stop('Exactly 23 staff records are required.');
  if (input.expectedDisplayedStaff !== 23 || input.expectedGeneratorEligible !== 20 || input.expectedFoodService !== 3) stop('Expected counts must be 23 displayed, 20 generator eligible, and 3 food service.');
  const seen = new Set();
  const staff = input.staff.map((raw, index) => {
    const employeeNumber = text(raw.employeeNumber, `staff[${index}].employeeNumber`, 50);
    if (!/^S(00[1-9]|01[0-9]|02[0-3])$/.test(employeeNumber)) stop('SYSTEM_SAFETY_BLOCK:ROSTER_CODE:anonymous staff code required');
    if (seen.has(employeeNumber)) stop(`Duplicate employeeNumber at staff[${index}].`); seen.add(employeeNumber);
    const departmentCode = text(raw.departmentCode, `staff[${index}].departmentCode`, 50).toUpperCase();
    if (!allowedEmployment.has(raw.employmentType)) stop(`staff[${index}].employmentType is invalid.`);
    if (!allowedClass.has(raw.assignedClass)) stop(`staff[${index}].assignedClass is invalid.`);
    const start = optionalTime(raw.regularWorkStartTime, `staff[${index}].regularWorkStartTime`);
    const end = optionalTime(raw.regularWorkEndTime, `staff[${index}].regularWorkEndTime`);
    if ((start == null) !== (end == null) || start && end && start >= end) stop(`staff[${index}] regular working time is incomplete or invalid.`);
    return { employeeNumber, displayName: text(raw.displayName, `staff[${index}].displayName`, 100), employmentType: raw.employmentType, assignedClass: raw.assignedClass, canWorkEarly: boolean(raw.canWorkEarly, `staff[${index}].canWorkEarly`), canWorkRegular: boolean(raw.canWorkRegular, `staff[${index}].canWorkRegular`), canWorkLate: boolean(raw.canWorkLate, `staff[${index}].canWorkLate`), earlyShiftOnly: raw.earlyShiftOnly === true, lateShiftOnly: raw.lateShiftOnly === true, canWorkSaturdays: boolean(raw.canWorkSaturdays, `staff[${index}].canWorkSaturdays`), monthlyWorkHourLimit: raw.monthlyWorkHourLimit ?? null, monthlyTargetWorkDays: raw.monthlyTargetWorkDays ?? null, monthlyTargetWorkHours: raw.monthlyTargetWorkHours ?? null, weeklyAvailableDays: raw.weeklyAvailableDays ?? null, regularWorkStartTime: start, regularWorkEndTime: end, departmentCode, departmentName: text(raw.departmentName, `staff[${index}].departmentName`, 100), generatorEligible: boolean(raw.generatorEligible, `staff[${index}].generatorEligible`), isFoodService: boolean(raw.isFoodService, `staff[${index}].isFoodService`) };
  });
  if (staff.filter((row) => row.generatorEligible).length !== 20) stop('Generator eligible count is not 20.');
  const food = staff.filter((row) => row.isFoodService); if (food.length !== 3 || food.some((row) => row.generatorEligible || row.departmentCode !== 'FOOD_SERVICE')) stop('Food service must contain exactly three generator-excluded staff.');
  const adminEmployeeNumber = text(input.adminEmployeeNumber, 'adminEmployeeNumber', 50);
  if (!seen.has(adminEmployeeNumber)) stop('Administrator employeeNumber must identify one of the 23 staff records.');
  return { input, staff, adminEmployeeNumber, checksum };
}

async function inspect(data) {
  const tenant = await prisma.tenant.findUnique({ where: { id: data.input.tenantId }, include: { subscription: true } });
  if (!tenant) stop('Target tenant was not found.');
  const current = await prisma.staff.findMany({ where: { tenantId: tenant.id }, include: { attributeAssignments: { where: { isActive: true }, include: { attributeDefinition: true } }, departmentAssignments: { where: { isActive: true }, include: { department: true } } } });
  const byNumber = new Map(current.map((row) => [row.employeeNumber, row]));
  const activeAdmins = await prisma.membership.findMany({ where: { tenantId: tenant.id, role: 'ADMIN', isActive: true }, select: { userId: true } });
  if (activeAdmins.length !== 1) stop('Target tenant must have exactly one active administrator before import.');
  const admin = current.find((row) => row.userId === activeAdmins[0].userId);
  if (admin && admin.employeeNumber !== data.adminEmployeeNumber) stop('Administrator is already linked to a different staff record.');
  const incoming = new Set(data.staff.map((row) => row.employeeNumber));
  const unexpected = current.filter((row) => row.isActive && !incoming.has(row.employeeNumber));
  if (unexpected.length) stop('Active staff outside the approved 23-record package exist; import stopped.');
  const unchanged = (incoming, existing) => existing.displayName === incoming.displayName && existing.employmentType === incoming.employmentType && existing.assignedClass === incoming.assignedClass && existing.canWorkEarly === incoming.canWorkEarly && existing.canWorkRegular === incoming.canWorkRegular && existing.canWorkLate === incoming.canWorkLate && existing.earlyShiftOnly === incoming.earlyShiftOnly && existing.lateShiftOnly === incoming.lateShiftOnly && existing.canWorkSaturdays === incoming.canWorkSaturdays && existing.monthlyWorkHourLimit === incoming.monthlyWorkHourLimit && existing.monthlyTargetWorkDays === incoming.monthlyTargetWorkDays && Number(existing.monthlyTargetWorkHours) === Number(incoming.monthlyTargetWorkHours) && existing.weeklyAvailableDays === incoming.weeklyAvailableDays && existing.regularWorkStartTime === incoming.regularWorkStartTime && existing.regularWorkEndTime === incoming.regularWorkEndTime && existing.isActive && existing.departmentAssignments.some((item) => item.department.code === incoming.departmentCode) && existing.attributeAssignments.some((item) => item.attributeDefinition.code === 'GENERATOR_EXCLUDED') === !incoming.generatorEligible && (incoming.employeeNumber !== data.adminEmployeeNumber || existing.userId === activeAdmins[0].userId);
  const newRows = data.staff.filter((row) => !byNumber.has(row.employeeNumber));
  const skippedRows = data.staff.filter((row) => byNumber.has(row.employeeNumber) && unchanged(row, byNumber.get(row.employeeNumber)));
  const summary = { mode: verifyOnly ? 'VERIFY' : apply ? 'APPLY' : 'DRY_RUN', checksum: data.checksum, anonymousCodesValid: true, new: newRows.length, update: data.staff.length - newRows.length - skippedRows.length, skip: skippedRows.length, errors: 0, displayed: data.staff.length, generatorEligible: data.staff.filter((row) => row.generatorEligible).length, foodService: data.staff.filter((row) => row.isFoodService).length, administratorLink: admin ? 'ALREADY_LINKED' : 'PENDING_LINK', resultingStaffLimit: Math.max(23, tenant.subscription?.staffLimit ?? 0) };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return { tenant, activeAdminUserId: activeAdmins[0].userId, byNumber };
}

async function applyImport(data, state) {
  const deployment = (process.env.DEPLOYMENT_ENV || '').trim().toLowerCase();
  if (deployment === 'production') {
    if (process.env.ALLOW_PRODUCTION_MUSUBI_IMPORT !== 'true') stop('Production import requires ALLOW_PRODUCTION_MUSUBI_IMPORT=true.');
    if (process.env.CONFIRM_MUSUBI_TENANT_ID !== data.input.tenantId) stop('Production tenant confirmation does not match.');
    if (process.env.CONFIRM_MUSUBI_STAFF_COUNT !== '23') stop('Production staff count confirmation does not match.');
  } else if (!['test', 'development', 'staging'].includes(deployment)) stop('DEPLOYMENT_ENV must be explicit.');
  await prisma.$transaction(async (tx) => {
    await tx.tenantSubscription.update({ where: { tenantId: data.input.tenantId }, data: { staffLimit: Math.max(23, state.tenant.subscription?.staffLimit ?? 0) } });
    const excluded = await tx.staffAttributeDefinition.upsert({ where: { tenantId_code: { tenantId: data.input.tenantId, code: 'GENERATOR_EXCLUDED' } }, update: { name: '自動生成対象外', category: 'ASSIGNMENT', isActive: true }, create: { tenantId: data.input.tenantId, code: 'GENERATOR_EXCLUDED', name: '自動生成対象外', shortName: '対象外', category: 'ASSIGNMENT', description: '承認済み取込データにより自動生成対象外とする汎用属性', isSystem: true } });
    const departments = new Map();
    for (const row of data.staff) if (!departments.has(row.departmentCode)) departments.set(row.departmentCode, await tx.department.upsert({ where: { tenantId_code: { tenantId: data.input.tenantId, code: row.departmentCode } }, update: { name: row.departmentName, isActive: true }, create: { tenantId: data.input.tenantId, code: row.departmentCode, name: row.departmentName, displayOrder: departments.size + 1 } }));
    for (const row of data.staff) {
      const staff = await tx.staff.upsert({ where: { tenantId_employeeNumber: { tenantId: data.input.tenantId, employeeNumber: row.employeeNumber } }, update: { displayName: row.displayName, employmentType: row.employmentType, assignedClass: row.assignedClass, canWorkEarly: row.canWorkEarly, canWorkRegular: row.canWorkRegular, canWorkLate: row.canWorkLate, earlyShiftOnly: row.earlyShiftOnly, lateShiftOnly: row.lateShiftOnly, canWorkSaturdays: row.canWorkSaturdays, monthlyWorkHourLimit: row.monthlyWorkHourLimit, monthlyTargetWorkDays: row.monthlyTargetWorkDays, monthlyTargetWorkHours: row.monthlyTargetWorkHours, weeklyAvailableDays: row.weeklyAvailableDays, regularWorkStartTime: row.regularWorkStartTime, regularWorkEndTime: row.regularWorkEndTime, isActive: true, ...(row.employeeNumber === data.adminEmployeeNumber ? { userId: state.activeAdminUserId } : {}) }, create: { tenantId: data.input.tenantId, employeeNumber: row.employeeNumber, displayName: row.displayName, employmentType: row.employmentType, assignedClass: row.assignedClass, canWorkEarly: row.canWorkEarly, canWorkRegular: row.canWorkRegular, canWorkLate: row.canWorkLate, earlyShiftOnly: row.earlyShiftOnly, lateShiftOnly: row.lateShiftOnly, canWorkSaturdays: row.canWorkSaturdays, monthlyWorkHourLimit: row.monthlyWorkHourLimit, monthlyTargetWorkDays: row.monthlyTargetWorkDays, monthlyTargetWorkHours: row.monthlyTargetWorkHours, weeklyAvailableDays: row.weeklyAvailableDays, regularWorkStartTime: row.regularWorkStartTime, regularWorkEndTime: row.regularWorkEndTime, ...(row.employeeNumber === data.adminEmployeeNumber ? { userId: state.activeAdminUserId } : {}) } });
      await tx.staffDepartmentAssignment.updateMany({ where: { tenantId: data.input.tenantId, staffId: staff.id, isActive: true }, data: { isActive: false } });
      await tx.staffDepartmentAssignment.create({ data: { tenantId: data.input.tenantId, staffId: staff.id, departmentId: departments.get(row.departmentCode).id, isPrimary: true } });
      const existing = await tx.staffAttributeAssignment.findFirst({ where: { tenantId: data.input.tenantId, staffId: staff.id, attributeDefinitionId: excluded.id, isActive: true } });
      if (!row.generatorEligible && !existing) await tx.staffAttributeAssignment.create({ data: { tenantId: data.input.tenantId, staffId: staff.id, attributeDefinitionId: excluded.id, notes: 'MUSUBI_BETA_APPROVED_IMPORT' } });
      if (row.generatorEligible && existing) await tx.staffAttributeAssignment.update({ where: { id: existing.id }, data: { isActive: false } });
    }
    await tx.auditLog.create({ data: { tenantId: data.input.tenantId, memberId: state.activeAdminUserId, action: 'MUSUBI_BETA_STAFF_IMPORTED', targetType: 'Tenant', targetId: data.input.tenantId, detail: { displayed: 23, generatorEligible: 20, foodService: 3, administratorLinkedToExistingStaff: true, inputSchemaVersion: 1 } } });
  });
  process.stdout.write('Import transaction committed. No names or credentials were logged.\n');
}

async function verify(data) {
  const rows = await prisma.staff.findMany({ where: { tenantId: data.input.tenantId, isActive: true }, include: { attributeAssignments: { where: { isActive: true }, include: { attributeDefinition: true } }, departmentAssignments: { where: { isActive: true }, include: { department: true } } } });
  const eligible = rows.filter((row) => !row.attributeAssignments.some((item) => item.attributeDefinition.code === 'GENERATOR_EXCLUDED')).length;
  const food = rows.filter((row) => row.departmentAssignments.some((item) => item.department.code === 'FOOD_SERVICE')).length;
  const admin = rows.filter((row) => row.userId != null).length;
  const result = { displayed: rows.length, generatorEligible: eligible, foodService: food, linkedLoginAccounts: admin, pass: rows.length === 23 && eligible === 20 && food === 3 && admin === 1 };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.pass) process.exitCode = 1;
}

async function main() { const data = loadInput(); const mode=verifyOnly?'VERIFY':apply?'APPLY':'DRY_RUN'; const operation='musubi-roster'; const guard=assertEnvironment({tenantId:data.input.tenantId,operation,mode,packageDigest:data.checksum}); await assertDatabaseSafety(prisma,data.input.tenantId); const state = await inspect(data); if (verifyOnly) return verify(data); if (!apply) { recordDryRun(operation,data.input.tenantId,guard); return; } if (readRoster(inputArg).checksum !== data.checksum) stop('SYSTEM_SAFETY_BLOCK:ROSTER_CHANGED:input changed after verification'); await applyImport(data, state); await verify(data); }
main().catch((error) => { process.stderr.write(`${error instanceof Error && (error.safe === true || error.message.startsWith('SYSTEM_SAFETY_BLOCK:')) ? error.message : 'SYSTEM_SAFETY_BLOCK:ROSTER_IMPORT_FAILED:import failed'}\n`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
