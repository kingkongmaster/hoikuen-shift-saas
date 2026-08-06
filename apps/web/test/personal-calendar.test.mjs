import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calendar = await readFile(new URL('../src/features/calendar/PersonalCalendar.tsx', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../src/features/dashboard/Dashboard.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8');

assert.match(client, /\/me\/calendar\?month=/, '本人専用APIを利用する');
assert.match(calendar, /setMonth\(moveMonth\(month, -1\)\)/, '前月移動がある');
assert.match(calendar, /setMonth\(moveMonth\(month, 1\)\)/, '翌月移動がある');
assert.ok(calendar.includes('開始') && calendar.includes('終了') && calendar.includes('休憩') && calendar.includes('勤務種別'), '勤務詳細を表示する');
for (const text of ['早出', '通常勤務', '遅出', '休み', '有給', '希望休申請中', '希望休承認済み', '希望休却下', '未確定シフト', '確定済みシフト']) assert.ok(calendar.includes(text), `${text}を文字で識別できる`);
assert.match(calendar, /確定後に変更された勤務/, '勤務変更を識別できる');
assert.match(styles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/, '7列がスマートフォン幅からはみ出さない');
assert.match(styles, /\.calendar-day \{[^}]*min-w-0/, '日付セルの横幅膨張を防ぐ');
assert.match(styles, /\.shift-cell-early \{ background: #ffedd5;/, '既存の早出色を再利用する');
assert.match(styles, /\.shift-cell-late \{ background: #dbeafe;/, '既存の遅出色を再利用する');
assert.ok(dashboard.includes('カレンダー') && dashboard.includes('マイページ') && dashboard.includes('has-five'), '職員用5項目下部メニューを表示する');
console.log('Personal calendar UI tests: PASS (mobile, statuses, accessibility, navigation)');
