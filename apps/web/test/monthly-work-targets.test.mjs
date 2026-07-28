import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const form = await readFile(new URL('../src/features/staff/StaffFormModal.tsx', import.meta.url), 'utf8');
const list = await readFile(new URL('../src/features/staff/StaffManagement.tsx', import.meta.url), 'utf8');
const shifts = await readFile(new URL('../src/features/shifts/ShiftManagement.tsx', import.meta.url), 'utf8');
const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8');
for (const field of ['monthlyTargetWorkDays', 'monthlyTargetWorkHours']) { assert.ok(client.includes(field)); assert.ok(form.includes(field)); }
assert.match(form, /月間目標勤務時間は月間勤務時間上限以下/);
assert.match(form, /max=\{31\}/, '目標日数は31日以下');
assert.match(list, /月間目標/, '管理者の職員一覧に目標を表示');
for (const text of ['勤務日数：','勤務時間：','上限：','目標未達','目標超過','上限接近','上限超過']) assert.ok(shifts.includes(text), `${text}を管理者月間表へ表示`);
assert.match(shifts, /manager \? <ManagerTable[\s\S]*: <PersonalSchedule/, '一般職員画面はPersonalScheduleのみで他職員目標を表示しない');
console.log('Monthly work targets web/admin visibility tests: PASS');
