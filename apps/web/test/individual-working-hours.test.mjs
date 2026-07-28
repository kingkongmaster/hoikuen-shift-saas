import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const form = await readFile(new URL('../src/features/staff/StaffFormModal.tsx', import.meta.url), 'utf8');
const list = await readFile(new URL('../src/features/staff/StaffManagement.tsx', import.meta.url), 'utf8');
const shifts = await readFile(new URL('../src/features/shifts/ShiftManagement.tsx', import.meta.url), 'utf8');
const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8');

for (const field of ['regularWorkStartTime', 'regularWorkEndTime']) {
  assert.ok(client.includes(field), `API型に${field}を含む`);
  assert.ok(form.includes(field), `職員フォームに${field}を含む`);
}
assert.match(form, /type="time"/, '時刻入力を使用する');
assert.match(form, /開始・終了を両方/, '片側だけの入力を拒否する');
assert.match(form, /終了時刻は開始時刻より後/, '時刻の前後関係を検証する');
assert.match(form, /園共通の通常勤務時間を使用/, '未設定時の動作を説明する');
assert.match(list, /園共通時間を使用/, '職員一覧で共通時間利用を表示する');
assert.match(list, /（個別）/, '職員一覧で時短勤務を識別できる');
assert.match(shifts, /通常 \{staff\.regularWorkStartTime\}〜\{staff\.regularWorkEndTime\}/, '月間表で個別通常勤務時間を簡潔に表示する');

console.log('Individual working hours web regression tests: PASS');
