const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const fixture = JSON.parse(readFileSync(join(__dirname, '../prisma/fixtures/musubi-nursery-provisional-demo.json'), 'utf8'));
const apply = process.argv.includes('--apply');
const deployment = (process.env.DEPLOYMENT_ENV || '').trim().toLowerCase();
const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
const banner = '*** 匿名の仮運用データです。正式データ・本番投入には使用できません。 ***';
console.log(banner);
console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', tenantCode: fixture.tenant.code, representedStaffCount: fixture.representedStaffCount, generatorEligibleCount: fixture.staff.filter((row) => row.generatorEligible).length, excludedCount: fixture.staff.filter((row) => !row.generatorEligible).length }, null, 2));
if (!apply) { console.log('dry-run完了: DB変更はありません。適用する場合だけ --apply を指定してください。'); process.exit(0); }
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URLを明示してください。');
if (deployment === 'production' || nodeEnv === 'production') throw new Error('production環境では実行できません。');
if (!['test', 'development'].includes(deployment)) throw new Error('DEPLOYMENT_ENVはtestまたはdevelopmentを明示してください。');
if (process.env.CONFIRM_PROVISIONAL_TENANT_CODE !== fixture.tenant.code) throw new Error('CONFIRM_PROVISIONAL_TENANT_CODEが一致しません。');
const adminEmail = process.env.MUSUBI_DEMO_ADMIN_EMAIL; const adminPassword = process.env.DEMO_USER_PASSWORD || 'ChangeMe123!';
if (!adminEmail) throw new Error('匿名デモ管理者のメールを環境変数で指定してください。');
if (process.env.MUSUBI_DEMO_ADMIN_PASSWORD && process.env.MUSUBI_DEMO_ADMIN_PASSWORD !== adminPassword) throw new Error('MUSUBI_DEMO_ADMIN_PASSWORD must match DEMO_USER_PASSWORD.');
const prisma = new PrismaClient();
const passwordHash = (password) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
const workPatterns = [
  { code: 'EARLY', name: '早出', shortName: '早', displayOrder: 10, startTime: fixture.settings.early[0], endTime: fixture.settings.early[1], breakMinutes: 60, color: '#f59e0b', isWorking: true, isDefault: false },
  { code: 'NORMAL', name: '通常', shortName: '通', displayOrder: 20, startTime: fixture.settings.normal[0], endTime: fixture.settings.normal[1], breakMinutes: 60, color: '#10b981', isWorking: true, isDefault: true },
  { code: 'LATE', name: '遅出', shortName: '遅', displayOrder: 30, startTime: fixture.settings.late[0], endTime: fixture.settings.late[1], breakMinutes: 60, color: '#6366f1', isWorking: true, isDefault: false },
  { code: 'OFF', name: '休み', shortName: '休', displayOrder: 40, startTime: null, endTime: null, breakMinutes: 0, color: '#94a3b8', isWorking: false, isDefault: false },
];
async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({ where: { code: fixture.tenant.code }, update: { name: fixture.tenant.name }, create: fixture.tenant });
    await tx.tenantSubscription.upsert({ where: { tenantId: tenant.id }, update: { plan: 'PROFESSIONAL', status: 'ACTIVE', staffLimit: 30 }, create: { tenantId: tenant.id, plan: 'PROFESSIONAL', status: 'ACTIVE', staffLimit: 30 } });
    const admin = await tx.user.upsert({ where: { email: adminEmail.toLowerCase() }, update: { displayName: '仮運用管理者', passwordHash: passwordHash(adminPassword), mustChangePassword: false, isActive: true }, create: { email: adminEmail.toLowerCase(), displayName: '仮運用管理者', passwordHash: passwordHash(adminPassword), mustChangePassword: false } });
    await tx.membership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } }, update: { role: 'ADMIN', isActive: true }, create: { tenantId: tenant.id, userId: admin.id, role: 'ADMIN' } });
    await tx.tenantFeature.upsert({ where: { tenantId_featureCode: { tenantId: tenant.id, featureCode: 'TENANT_CUSTOM_RULES' } }, update: { enabled: true, source: 'CUSTOM_CONTRACT', createdByUserId: admin.id }, create: { tenantId: tenant.id, featureCode: 'TENANT_CUSTOM_RULES', enabled: true, source: 'CUSTOM_CONTRACT', createdByUserId: admin.id } });
    await tx.tenantShiftSetting.upsert({ where: { tenantId: tenant.id }, update: { saturdayOperationEnabled: true, sundayOperationEnabled: false, weekdayEarlyRequired: fixture.settings.weekdayEarlyRequired, weekdayLateRequired: fixture.settings.weekdayLateRequired, saturdayMinimumStaff: fixture.settings.saturdayMinimumStaff, saturdayEarlyRequired: fixture.settings.saturdayEarlyRequired, saturdayLateRequired: fixture.settings.saturdayLateRequired, defaultStartEarly: fixture.settings.early[0], defaultEndEarly: fixture.settings.early[1], defaultStartNormal: fixture.settings.normal[0], defaultEndNormal: fixture.settings.normal[1], defaultStartLate: fixture.settings.late[0], defaultEndLate: fixture.settings.late[1] }, create: { tenantId: tenant.id, saturdayOperationEnabled: true, sundayOperationEnabled: false, weekdayEarlyRequired: fixture.settings.weekdayEarlyRequired, weekdayLateRequired: fixture.settings.weekdayLateRequired, saturdayMinimumStaff: fixture.settings.saturdayMinimumStaff, saturdayEarlyRequired: fixture.settings.saturdayEarlyRequired, saturdayLateRequired: fixture.settings.saturdayLateRequired, defaultStartEarly: fixture.settings.early[0], defaultEndEarly: fixture.settings.early[1], defaultStartNormal: fixture.settings.normal[0], defaultEndNormal: fixture.settings.normal[1], defaultStartLate: fixture.settings.late[0], defaultEndLate: fixture.settings.late[1] } });
    for (const pattern of workPatterns) await tx.workPattern.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: pattern.code } }, update: { ...pattern, isSystem: true, isActive: true }, create: { tenantId: tenant.id, ...pattern, isSystem: true, isActive: true } });
    for (const [classType, weekdayRequired] of Object.entries(fixture.provisionalClassRequirements)) await tx.classStaffingRequirement.upsert({ where: { tenantId_classType: { tenantId: tenant.id, classType } }, update: { weekdayRequired, saturdayRequired: 0, isActive: true }, create: { tenantId: tenant.id, classType, weekdayRequired, saturdayRequired: 0, isActive: true } });
    const manager = await tx.staff.upsert({ where: { tenantId_employeeNumber: { tenantId: tenant.id, employeeNumber: 'MANAGER-01' } }, update: { userId: admin.id, displayName: 'MANAGER-01', jobTitle: '管理職（確認済み）', isActive: true }, create: { tenantId: tenant.id, userId: admin.id, employeeNumber: 'MANAGER-01', displayName: 'MANAGER-01', jobTitle: '管理職（確認済み）', assignedClass: 'FREE' } });
    const staffByCode = new Map([['MANAGER-01', manager]]);
    for (const item of fixture.staff.filter((row) => row.code !== 'MANAGER-01')) {
      const part = item.kind.startsWith('PART_'); const earlyOnly = item.earlyOnly === true; const regularTime = item.regularTime || null;
      const data = { displayName: item.code, employmentType: part ? 'PART_TIME' : 'FULL_TIME', assignedClass: item.classType, canWorkEarly: earlyOnly || item.early !== false, canWorkRegular: item.regular !== false && !earlyOnly, canWorkLate: item.late !== false && !earlyOnly, earlyShiftOnly: earlyOnly, lateShiftOnly: false, canWorkSaturdays: true, monthlyWorkHourLimit: part ? 120 : 192, weeklyAvailableDays: part ? 4 : 5, regularWorkStartTime: regularTime?.[0] || null, regularWorkEndTime: regularTime?.[1] || null, notes: `PROVISIONAL_DEMO:${item.kind}`, isActive: true };
      const row = await tx.staff.upsert({ where: { tenantId_employeeNumber: { tenantId: tenant.id, employeeNumber: item.code } }, update: data, create: { tenantId: tenant.id, employeeNumber: item.code, ...data } }); staffByCode.set(item.code, row);
    }
    const definitions = [
      ['GENERATOR_EXCLUDED', '生成対象外（仮運用）', 'ROLE'], ['TEST_NEW', '新人（テスト用）', 'SKILL'], ['TEST_MID', '中堅（テスト用）', 'SKILL'], ['TEST_VETERAN', 'ベテラン（テスト用）', 'SKILL'], ['CHILDCARE_SUPPORT', '子育て支援担当', 'ASSIGNMENT'],
    ];
    const definitionByCode = new Map();
    for (const [code, name, category] of definitions) definitionByCode.set(code, await tx.staffAttributeDefinition.upsert({ where: { tenantId_code: { tenantId: tenant.id, code } }, update: { name, category, isActive: true }, create: { tenantId: tenant.id, code, name, category, description: 'PROVISIONAL_DEMO: 正式値ではありません。', isActive: true } }));
    const attrs = fixture.staff.flatMap((item) => [item.experience, !item.generatorEligible && item.code !== 'MANAGER-01' ? 'GENERATOR_EXCLUDED' : null, item.code.startsWith('SUPPORT-') ? 'CHILDCARE_SUPPORT' : null].filter(Boolean).map((code) => [item.code, code]));
    for (const [staffCode, definitionCode] of attrs) { const staff = staffByCode.get(staffCode); const definition = definitionByCode.get(definitionCode); const existing = await tx.staffAttributeAssignment.findFirst({ where: { tenantId: tenant.id, staffId: staff.id, attributeDefinitionId: definition.id } }); if (!existing) await tx.staffAttributeAssignment.create({ data: { tenantId: tenant.id, staffId: staff.id, attributeDefinitionId: definition.id, notes: 'PROVISIONAL_DEMO', isActive: true } }); else if (!existing.isActive) await tx.staffAttributeAssignment.update({ where: { id: existing.id }, data: { isActive: true } }); }
    await tx.auditLog.create({ data: { tenantId: tenant.id, memberId: admin.id, action: 'MUSUBI_PROVISIONAL_DEMO_SETUP', targetType: 'Tenant', targetId: tenant.id, detail: { provisional: true, productionUseAllowed: false, representedStaffCount: 23, generatorEligibleCount: 20 } } });
    return { tenantId: tenant.id, staffCount: await tx.staff.count({ where: { tenantId: tenant.id } }) };
  });
  console.log(JSON.stringify({ applied: true, ...result }, null, 2));
}
main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error.message); process.exitCode = 1; });
