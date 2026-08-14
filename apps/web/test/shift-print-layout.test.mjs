import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../src/features/exports/shift-print-layout.ts', import.meta.url), 'utf8');
const calendar = await readFile(new URL('../src/features/calendar/PersonalCalendar.tsx', import.meta.url), 'utf8');
const exportsPage = await readFile(new URL('../src/features/exports/DataExportManagement.tsx', import.meta.url), 'utf8');

assert.ok(layout.includes('class="monthly"') && layout.includes('first.staffName'), '管理者表は職員×日付の月間一覧を持つ');
assert.ok(layout.includes("paper: 'B4'") && layout.includes("orientation: 'landscape'"), '管理者表の既定値はB4横');
for (const paper of ["'A4'", "'A3'", "'B4'"]) assert.ok(layout.includes(paper), `共通印刷用紙: ${paper}`);
assert.ok(layout.includes("['月','火','水','木','金','土','日']"), '本人用PDFは月曜始まりの7列カレンダー');
assert.ok(layout.includes('data.ownOnly') === false, '印刷レイアウトは受領済み本人データ以外を追加取得しない');
for (const label of ['早出', '通常', '遅出', '休', '有休', '午前休', '午後休']) assert.ok(layout.includes(label), `色に加えて勤務文字を表示: ${label}`);
for (const className of ['shift-early', 'shift-normal', 'shift-late', 'shift-off', 'shift-paid', 'shift-half', 'shift-other']) assert.ok(layout.includes(className), `勤務種別の印刷色: ${className}`);
assert.ok(layout.includes('print-color-adjust:exact'), 'カラー印刷を維持する');
assert.ok(calendar.includes('api.printShifts(token, month, true)'), '本人画面は本人専用印刷APIを使う');
assert.ok(calendar.includes('PDF表示・印刷'), '本人カレンダーからPDF表示へ進める');
assert.ok(exportsPage.includes('管理者用｜全職員シフト表') && exportsPage.includes('わたしの勤務カレンダー'), '管理者用と本人用の目的を分離する');
assert.ok(exportsPage.includes('aria-label="印刷用紙"') && exportsPage.includes('aria-label="印刷方向"'), '用紙と縦横を選択できる');
assert.ok(exportsPage.includes('adminPrintHtml(data, classFilter, options)'), 'クラスコードを保持したまま印刷レイアウトへ渡す');

console.log('Shift print layout tests: PASS');
