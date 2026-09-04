const assert = require('node:assert/strict');
const base = process.env.API_BASE_URL || 'http://127.0.0.1:18083/api';
async function call(path, options = {}, token) { const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers } }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`); return body; }
(async () => {
  const loginId=process.env.MUSUBI_E2E_LOGIN_ID||'phase-a-admin@example.invalid'; const initialPassword=process.env.MUSUBI_E2E_INITIAL_PASSWORD||'PhaseA-Local-Only-2026!'; const changedPassword=process.env.MUSUBI_E2E_CHANGED_PASSWORD||'PhaseA-Local-Changed-2026!';
  let login; try { login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password: initialPassword }) }); } catch { login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password: changedPassword }) }); }
  if (login.mustChangePassword) { await call('/auth/change-initial-password', { method: 'POST', body: JSON.stringify({ currentPassword: initialPassword, newPassword: changedPassword, confirmPassword: changedPassword }) }, login.accessToken); login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password: changedPassword }) }); }
  const token = login.accessToken;
  const staff = await call('/staff', {}, token); const byCode = new Map(staff.map((row) => [row.employeeNumber, row]));
  assert.equal(staff.length, 23);
  await call('/requests', { method: 'POST', body: JSON.stringify({ staffId: byCode.get('S005').id, requestDate: '2026-10-07', requestType: 'DAY_OFF', reason: 'PENDINGは自動制約にしない確認' }) }, token);
  await call('/tenant-calendar/events', { method: 'POST', body: JSON.stringify({ eventDate: '2026-10-20', name: '10月隔離受入行事', eventType: 'ONSITE', fixedTimeStaffAllowed: true, sourceType: 'ADMIN_CONFIRMED', sourceReference: 'Phase A October acceptance' }) }, token);
  await call('/closed-dates', { method: 'POST', body: JSON.stringify({ closedDate: '2026-10-12', name: 'スポーツの日' }) }, token);
  const request = await call('/requests', { method: 'POST', body: JSON.stringify({ staffId: byCode.get('S004').id, requestDate: '2026-10-08', requestType: 'HALF_DAY_PM', reason: 'Phase A基礎勤務未確定検証' }) }, token);
  await call(`/requests/${request.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED', adminComment: '隔離受入試験' }) }, token);
  const schedule = await call('/shifts', { method: 'POST', body: JSON.stringify({ month: '2026-10' }) }, token); const scheduleId = schedule.id || schedule.schedule?.id;
  const before = await call(`/shifts/${scheduleId}/precheck`, { method: 'POST' }, token);
  assert.equal(before.canGenerate, false); assert.ok(before.fatalIssues.some((row) => row.code === 'HALF_DAY_BASE_ASSIGNMENT_UNCONFIRMED' && row.message.includes('2026-10-08')));
  assert.ok(before.diagnostics.some((row) => row.code === 'PENDING_REQUEST_REVIEW' && row.severity === 'INFO'));
  await call('/tenant-calendar/rule-exceptions', { method: 'POST', body: JSON.stringify({ exceptionDate: '2026-10-08', exceptionType: 'STAFF_WORK_PATTERN', configuration: { staffCode: 'S004', workPatternCode: 'NORMAL' }, reason: '半休の基礎勤務を管理者が指定', sourceType: 'ADMIN_CONFIRMED', sourceReference: 'Phase A October acceptance' }) }, token);
  await call('/tenant-calendar/rule-exceptions', { method: 'POST', body: JSON.stringify({ exceptionDate: '2026-10-08', exceptionType: 'HARD_RULE_OVERRIDE', configuration: { staffCode: 'S013', workPatternCode: 'LATE', ruleType: 'UNAVAILABLE_WORK_PATTERN' }, reason: '日付限定の管理者例外承認試験', sourceType: 'ADMIN_CONFIRMED', sourceReference: 'Phase A October acceptance' }) }, token);
  await call('/tenant-calendar/rule-exceptions', { method: 'POST', body: JSON.stringify({ exceptionDate: '2026-10-08', exceptionType: 'WEEKLY_ROTATION_LIMIT', configuration: { maxWeeklyRotationCount: 3, maxAssignments: 1, originalCondition: '週2回上限', approvedException: 'S013の3回目を日付限定承認' }, reason: '必要人数とHARD日付例外を確認した管理者判断', sourceType: 'ADMIN_CONFIRMED', sourceReference: 'Phase A October acceptance' }) }, token);
  const after = await call(`/shifts/${scheduleId}/precheck`, { method: 'POST' }, token);
  assert.ok(!after.fatalIssues.some((row) => row.code === 'HALF_DAY_BASE_ASSIGNMENT_UNCONFIRMED'));
  const initialGeneration = await call(`/shifts/${scheduleId}/generate`, { method: 'POST' }, token);
  assert.ok(initialGeneration.warnings.some((row) => row.code === 'WEEKLY_PATTERN_RELAXATION_EXHAUSTED' && row.message.includes('管理者判断')));
  for (const day of ['09', '23', '30']) await call('/tenant-calendar/rule-exceptions', { method: 'POST', body: JSON.stringify({ exceptionDate: `2026-10-${day}`, exceptionType: 'WEEKLY_ROTATION_LIMIT', configuration: { maxWeeklyRotationCount: 3, maxAssignments: 3 }, reason: '生成結果の必要人数不足を確認し日付限定承認', sourceType: 'ADMIN_CONFIRMED', sourceReference: 'Phase A October warning resolution' }) }, token);
  const generated = await call(`/shifts/${scheduleId}/generate`, { method: 'POST' }, token);
  assert.equal(generated.warningSummary.ERROR, 0); assert.equal(generated.warningSummary.WARNING, 0);
  assert.equal(generated.generatedCount, 23 * 31); assert.equal(generated.fixedMaterializedCount, 3 * 31);
  assert.ok(generated.warnings.some((row) => row.code === 'ADMIN_APPROVED_HARD_RULE_OVERRIDE' && row.staffId === byCode.get('S013').id));
  const view = await call(`/shifts/${scheduleId}`, {}, token); const half = view.assignments.find((row) => row.staffId === byCode.get('S004').id && row.workDate.slice(0, 10) === '2026-10-08'); assert.equal(half.workPattern.code, 'NORMAL'); assert.equal(half.attendanceModifier.modifierType, 'PM_PAID_LEAVE');
  const fixed = view.assignments.find((row) => row.staffId === byCode.get('S014').id && row.workDate.slice(0, 10) === '2026-10-20'); assert.equal(fixed.startTime, '09:00'); assert.equal(fixed.endTime, '16:30');
  await call(`/shifts/${scheduleId}/confirm`, { method: 'POST' }, token);
  const confirmed = await call(`/shifts/${scheduleId}`, {}, token); assert.equal(confirmed.schedule.status, 'CONFIRMED');
  const months = await Promise.all(['/tenant-calendar/events?month=2026-09', '/tenant-calendar/rule-exceptions?month=2026-09'].map((path) => call(path, {}, token))); assert.deepEqual(months.map((rows) => rows.length), [0, 0]);
  console.log(JSON.stringify({ pass: true, staff: staff.length, octoberAssignments: generated.generatedCount, rotationGenerated: generated.rotationGeneratedCount, fixedMaterialized: generated.fixedMaterializedCount, pendingVisibleButNotBlocking: true, halfDayUnknownDetected: true, halfDayResolvedByAdmin: true, shortageDetected: true, shortageResolvedByAdmin: true, hardRuleOverrideAudited: true, confirmRevalidated: true, finalErrors: generated.warningSummary.ERROR, finalWarnings: generated.warningSummary.WARNING, septemberLeakage: 0 }, null, 2));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
