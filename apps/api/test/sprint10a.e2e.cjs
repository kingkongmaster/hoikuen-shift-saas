const assert = require('node:assert/strict');
const { EmploymentType, PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const tenantId = '00000000-0000-4000-8000-000000000001';

async function call(path, init = {}, token, responseType = 'json') {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = responseType === 'text' ? await response.text() : await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
}
async function login(email) {
  const result = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'ChangeMe123!' }) });
  assert.equal(result.status, 200, `${email} login`);
  return result.body.accessToken;
}

async function main() {
  const adminToken = await login('owner@demo.enshift.local');
  const staffToken = await login('staff@demo.enshift.local');
  const [staffCount, partCount, reemployedCount, requestCount, confirmed, notificationCount, swapCount] = await Promise.all([
    prisma.staff.count({ where: { tenantId, isActive: true } }),
    prisma.staff.count({ where: { tenantId, isActive: true, employmentType: EmploymentType.PART_TIME } }),
    prisma.staff.count({ where: { tenantId, isActive: true, employmentType: EmploymentType.REEMPLOYED } }),
    prisma.shiftRequest.count({ where: { tenantId } }),
    prisma.monthlyShift.findUnique({ where: { tenantId_targetMonth: { tenantId, targetMonth: new Date('2026-07-01T00:00:00.000Z') } }, include: { _count: { select: { assignments: true } } } }),
    prisma.notification.count({ where: { tenantId } }),
    prisma.shiftSwapRequest.count({ where: { tenantId } }),
  ]);
  assert.equal(staffCount, 15, `デモ職員 ${staffCount}名`);
  assert.equal(partCount, 3, `パート職員 ${partCount}名`);
  assert.equal(reemployedCount, 1, `再雇用職員 ${reemployedCount}名`);
  assert.equal(requestCount, 10, `希望休 ${requestCount}件`);
  assert.equal(confirmed?.status, 'CONFIRMED');
  assert.equal(confirmed?._count.assignments, 15 * 31, '15名×7月31日の確定シフト');
  assert.ok(notificationCount >= 4, 'デモ通知');
  assert.ok(swapCount >= 1, 'デモ交換申請');

  for (const [path, header] of [
    ['/exports/staff.csv', '職員番号'],
    ['/exports/shift-requests.csv?month=2026-07', '希望休種別'],
    ['/exports/shifts.csv?month=2026-07', '勤務区分'],
    ['/exports/audit.csv', '発生日時'],
  ]) {
    const result = await call(path, {}, adminToken, 'text');
    assert.equal(result.status, 200, path);
    assert.ok(result.body.includes(header), `${path} header`);
    assert.match(result.headers.get('content-type') ?? '', /text\/csv/);
  }

  const overall = await call('/exports/print/shifts?month=2026-07', {}, adminToken);
  assert.equal(overall.status, 200);
  assert.equal(overall.body.ownOnly, false);
  assert.equal(overall.body.assignments.length, 15 * 31);
  assert.ok(overall.body.assignments.some((row) => row.assignedClass === '0歳児'), 'クラス別印刷の元データ');
  const personal = await call('/exports/print/my-shift?month=2026-07', {}, staffToken);
  assert.equal(personal.status, 200);
  assert.equal(personal.body.ownOnly, true);
  assert.equal(personal.body.assignments.length, 31);

  const exported = await call('/backups/export', { method: 'POST' }, adminToken);
  assert.equal(exported.status, 201);
  assert.equal(exported.body.format, 'enshift-backup');
  assert.ok(exported.body.counts.staff >= staffCount, 'バックアップには無効化済みの履歴職員を含められる');
  const validated = await call('/backups/validate', { method: 'POST', body: JSON.stringify({ backup: exported.body }) }, adminToken);
  assert.equal(validated.status, 201);
  assert.equal(validated.body.valid, true);
  const preview = await call('/backups/preview-restore', { method: 'POST', body: JSON.stringify({ backup: exported.body }) }, adminToken);
  assert.equal(preview.status, 201);
  assert.equal(preview.body.valid, true);
  assert.ok(preview.body.warnings.some((warning) => warning.includes('変更されません')));

  const notifications = await call('/notifications', {}, adminToken);
  assert.equal(notifications.status, 200);
  assert.ok(notifications.body.some((row) => !row.isRead), '未読通知');
  const target = notifications.body.find((row) => !row.isRead);
  const original = await prisma.notification.findUniqueOrThrow({ where: { id: target.id }, select: { isRead: true } });
  try {
    const read = await call(`/notifications/${target.id}/read`, { method: 'PATCH' }, adminToken);
    assert.equal(read.status, 200);
    assert.equal(read.body.isRead, true);
  } finally {
    await prisma.notification.update({ where: { id: target.id }, data: original });
  }
  assert.equal((await call('/notifications')).status, 401);

  console.log('Sprint 10-A API integration tests: PASS (デモ15名・希望休・確定シフト・通知・交換・CSV・印刷/PDF・バックアップ)');
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
