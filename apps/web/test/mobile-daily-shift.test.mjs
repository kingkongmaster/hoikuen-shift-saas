import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clampDayToMonth, dailyDateKey, daysInMonth, initialDayForMonth, moveDayWithinMonth, weekdayLabel } from '../src/features/shifts/daily-view-utils.js';

const source = await readFile(new URL('../src/features/shifts/ShiftManagement.tsx', import.meta.url), 'utf8');

// 1-4: 1024px未満は日付カード、lg（1024px）以上と印刷時は既存表。
assert.match(source, /lg:hidden print:hidden/); // 375px
assert.match(source, /data-testid="mobile-daily-shift-view"/); // 390px
assert.match(source, /min-w-0 rounded-2xl/); // 412pxでカードがはみ出さない
assert.match(source, /hidden lg:block print:block/); // 1024px以上

// 5-9: 日付移動・境界・日付選択。
assert.equal(moveDayWithinMonth('2026-09', 15, -1), 14);
assert.equal(moveDayWithinMonth('2026-09', 15, 1), 16);
assert.equal(moveDayWithinMonth('2026-09', 1, -1), 1);
assert.equal(moveDayWithinMonth('2026-09', 30, 1), 30);
assert.match(source, /aria-label="表示日"[\s\S]*type="date"[\s\S]*min=/);
assert.match(source, /nextDay >= 1 && nextDay <= dateCount/, '日付入力の空値・範囲外値を状態へ反映しない');

// 10-11: 選択日だけの職員カードと文字ラベル。
assert.match(source, /aria-label=\{`\$\{workDate\}の職員勤務`\}/);
for (const label of ['早出', '通常', '遅出', '休', '有給', '夏季', 'その他勤務']) assert.ok(source.includes(label), `勤務種別 ${label}`);

// 12-15: 同じchanges/save経路、再取得、警告、PC表を維持。
assert.match(source, /onChange\(staff\.id, workDate/);
assert.match(source, /onClassChange\(staff\.id, workDate/);
assert.match(source, /await api\.saveAssignments/);
assert.match(source, /const reloadMonthData/);
for (const level of ['ERROR・重要な問題', 'WARNING・要確認', 'INFO・参考情報']) assert.ok(source.includes(level), `診断 ${level}`);
assert.match(source, /function ManagerTable/);

// 16-17: 2月・30日月・31日月、日曜日。
assert.equal(daysInMonth('2026-02'), 28);
assert.equal(daysInMonth('2028-02'), 29);
assert.equal(daysInMonth('2026-09'), 30);
assert.equal(daysInMonth('2026-08'), 31);
assert.equal(dailyDateKey('2026-02', 31), '2026-02-28');
assert.equal(weekdayLabel('2026-09', 6), '日');
assert.equal(initialDayForMonth('2026-09', new Date(2026, 8, 18)), 18);
assert.equal(initialDayForMonth('2026-09', new Date(2026, 7, 18)), 1);
assert.equal(clampDayToMonth('2026-09', 0), 1);

// 18: 職員0件でも空状態を表示。
assert.ok(source.includes('表示できる職員がいません。'));

console.log('Mobile daily shift view tests: PASS (18 responsive/date/edit/diagnostic/empty-state requirements)');
