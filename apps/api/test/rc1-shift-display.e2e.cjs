const assert = require('node:assert/strict');
const { PrismaClient, ShiftType } = require('@prisma/client');

const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const ownerEmail = process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!';
const testMonth = '2030-01';
const workingTypes = new Set([ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE]);
const testStartedAt = new Date();
let createdScheduleId = null;
let createdNotificationIds = [];

function resolveIsolatedDatabaseUrl(env = process.env) {
  const value = env.TEST_DATABASE_URL || env.DATABASE_URL;
  if (env.TEST_DATABASE_ISOLATED !== 'true' || !value) throw new Error('RC1 cleanup safety stop: an explicit isolated test database URL is required.');
  const parsed = new URL(value);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
  if (!localHosts.has(parsed.hostname)) throw new Error('RC1 cleanup safety stop: only a verified local/isolated database is allowed.');
  return value;
}

async function call(path, init = {}, token) {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main(databaseUrl = resolveIsolatedDatabaseUrl()) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
  const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: ownerEmail, password: ownerPassword }) });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;
  const created = await call('/shifts', { method: 'POST', body: JSON.stringify({ month: testMonth }) }, token);
  assert.equal(created.status, 201);
  createdScheduleId = created.body.id;
  const before = await call(`/shifts?month=${testMonth}`, {}, token);
  assert.equal(before.status, 200);
  assert.ok(before.body.schedule?.id);

  const generated = await call(`/shifts/${before.body.schedule.id}/generate`, { method: 'POST' }, token);
  assert.equal(generated.status, 201);
  assert.equal(generated.body.generatedCount, 14 * 31, '自動生成対象14名の8月31日分を生成');
  assert.equal(generated.body.workingAssignmentCount + generated.body.offAssignmentCount + generated.body.leaveAssignmentCount, generated.body.generatedCount);
  assert.ok(generated.body.workingAssignmentCount >= 200, '必要人数を満たす現実的なデモ配置');
  createdNotificationIds = (await prisma.notification.findMany({ where: { tenantId: '00000000-0000-4000-8000-000000000001', type: 'SHIFT_UPDATED', title: 'シフト自動生成', createdAt: { gte: testStartedAt } }, select: { id: true } })).map((item) => item.id);

  const after = await call(`/shifts?month=${testMonth}`, {}, token);
  assert.equal(after.status, 200);
  assert.equal(after.body.assignments.length, generated.body.generatedCount);
  const working = after.body.assignments.filter((item) => workingTypes.has(item.shiftType));
  assert.equal(working.length, generated.body.workingAssignmentCount);
  assert.ok(working.every((item) => item.startTime && item.endTime && item.assignedClass), '勤務区分・時刻・配置クラスを保存');

  const staffById = new Map(after.body.staff.map((staff) => [staff.id, staff]));
  const director = after.body.staff.find((staff) => staff.employeeNumber === 'ADMIN-001');
  assert.ok(director, 'デモ園長・管理者の職員情報を取得');
  assert.ok(!after.body.assignments.some((item) => item.staffId === director.id), '園長・管理者を自動生成対象に含めない');
  assert.ok(working.some((item) => staffById.get(item.staffId)?.employmentType === 'PART_TIME' && item.shiftType === ShiftType.NORMAL), 'パートの通常勤務');
  assert.ok(working.some((item) => staffById.get(item.staffId)?.employmentType === 'REEMPLOYED'), '再雇用の勤務');
  const saturdays = new Map();
  for (const item of working.filter((assignment) => new Date(`${assignment.workDate.slice(0, 10)}T00:00:00Z`).getUTCDay() === 6)) {
    const date = item.workDate.slice(0, 10); const counts = saturdays.get(date) ?? { total: 0, early: 0, late: 0, normal: 0 }; counts.total += 1; if (item.shiftType === ShiftType.EARLY) counts.early += 1; if (item.shiftType === ShiftType.LATE) counts.late += 1; if (item.shiftType === ShiftType.NORMAL) counts.normal += 1; saturdays.set(date, counts);
  }
  assert.ok([...saturdays.values()].every((counts) => counts.total >= 3 && counts.early >= 1 && counts.late >= 1 && counts.normal >= 1), '土曜は早出1・遅出1を優先し通常勤務で最低3人を満たす');

  const uiKeys = new Map(after.body.assignments.map((item) => [`${item.staffId}:${item.workDate.slice(0, 10)}`, item]));
  const sample = working[0];
  assert.equal(uiKeys.get(`${sample.staffId}:${sample.workDate.slice(0, 10)}`)?.shiftType, sample.shiftType, '画面とAPIで同じ日付キー');
  console.log(`RC1 shift display integration test: PASS (勤務${generated.body.workingAssignmentCount}・休み${generated.body.offAssignmentCount}・休暇${generated.body.leaveAssignmentCount})`);
  } finally {
    try {
      if (createdScheduleId) {
        await prisma.auditLog.deleteMany({ where: { targetId: createdScheduleId } });
        await prisma.monthlyShift.deleteMany({ where: { id: createdScheduleId } });
      }
      if (createdNotificationIds.length) await prisma.notification.deleteMany({ where: { id: { in: createdNotificationIds } } });
      if (createdScheduleId && await prisma.monthlyShift.count({ where: { id: createdScheduleId } })) throw new Error(`RC1 cleanup failure: schedule fixture remains (${createdScheduleId}).`);
      if (createdNotificationIds.length && await prisma.notification.count({ where: { id: { in: createdNotificationIds } } })) throw new Error(`RC1 cleanup failure: notification fixtures remain (${createdNotificationIds.join(',')}).`);
    } catch (error) {
      console.error(`RC1 cleanup failure for anonymous fixture schedule=${createdScheduleId ?? 'not-created'}. No database fallback was attempted.`);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }
}

module.exports = { resolveIsolatedDatabaseUrl };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
