import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assignmentKey } from '../src/features/shifts/assignment-key.js';

const staffId = 'staff-001';
const assignments = new Map([
  [assignmentKey(staffId, '2026-08-01T00:00:00.000Z'), { shiftType: 'EARLY', assignedClass: 'AGE_0' }],
]);

assert.deepEqual(assignments.get(assignmentKey(staffId, '2026-08-01')), {
  shiftType: 'EARLY',
  assignedClass: 'AGE_0',
});

const source = await readFile(new URL('../src/features/shifts/ShiftManagement.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const staff = await readFile(new URL('../src/features/staff/StaffManagement.tsx', import.meta.url), 'utf8');
const exportsPage = await readFile(new URL('../src/features/exports/DataExportManagement.tsx', import.meta.url), 'utf8');
const printLayout = await readFile(new URL('../src/features/exports/shift-print-layout.ts', import.meta.url), 'utf8');
assert.match(source, /await reloadMonthData\(month\)/, '自動生成後に対象月を再取得する');
assert.match(source, /assignmentKey\(assignment\.staffId, assignment\.workDate\)/, 'APIレスポンスの日付を正規化する');
assert.match(source, /assignmentKey\(staff\.id, workDate\)/, '表の日付も同じ規則で正規化する');
assert.match(source, /<details>/, '勤務条件の警告を初期状態で折りたたむ');
assert.match(source, /内容を確認する/, '警告詳細を開く操作を表示する');
for (const label of ['エラー（修正が必要）', '確認してほしい項目', 'お知らせ']) assert.ok(source.includes(label), `重要度ラベル: ${label}`);
for (const label of ['契約時間より勤務時間が少ない職員', '契約日数より勤務日数が少ない職員', '契約時間を超えて勤務しています', '契約日数を超えて勤務しています', 'フリー職員が応援しました', '他クラスへ応援しました', '日曜日のため勤務はありません', '休園日です']) assert.ok(source.includes(label), `日本語の確認項目: ${label}`);
for (const label of ['ⓘ 詳細', 'なぜ表示されたのか', '何を確認すればよいか']) assert.ok(source.includes(label), `説明補助: ${label}`);
assert.doesNotMatch(source, /\{item\.code\}|\{warning\.code\}:|\[\{item\.level\}\]/, '英語コードを画面へ表示しない');
assert.match(source, /min-h-11/, '390pxでも押しやすい警告展開操作');
for (const label of ['全員表示', '出勤者を強調', '休みを薄く表示']) assert.ok(source.includes(label), `表示切替: ${label}`);
for (const label of ['通常', '早出', '遅出', '希望休', '有給', '夏季', '半休']) assert.ok(source.includes(label), `勤務区分の正式名称: ${label}`);
assert.ok(source.includes("useState<ShiftDisplayMode>('emphasize')"), '出勤者強調を初期表示にする');
assert.ok(source.includes('出勤 ${count.working}人') && source.includes('早出 ${count.early}人') && source.includes('休み ${count.off}人'), '日別人数内訳');
assert.ok(source.includes("'担当クラス'") && source.includes('saved.startTime'), '担当クラスと勤務時間を読み上げる');
assert.ok(source.includes("'運営'") && source.includes('応援先') && source.includes('staff.isDirector'), '園長の運営・応援表示');
assert.ok(source.includes('overflow-x-auto') && source.includes('tabIndex={0}'), '表だけ横スクロールしキーボード操作可能');
assert.match(styles, /\.shift-cell-normal \{[^}]*var\(--brand-soft\)/, '通常勤務はブランドカラーを維持');
assert.match(styles, /\.shift-cell-early \{ background: #ffedd5; color: #9a3412;/, '早出はオレンジ系');
assert.match(styles, /\.shift-cell-late \{ background: #dbeafe; color: #172554;/, '遅出はネイビー系');
assert.match(styles, /\.shift-cell-off \{ background: #fafbf9;/, '休みは既存グレーを維持');
assert.match(styles, /\.shift-cell-request, \.shift-cell-paid \{ background: #fff7d9;/, '希望休・有給は既存色を維持');
for (const className of ['shift-cell-early', 'shift-cell-normal', 'shift-cell-late']) assert.ok(staff.includes(className), `職員一覧の勤務区分色: ${className}`);
assert.ok(printLayout.includes('.shift-early{background:#ffedd5;color:#7c2d12}'), '印刷の早出はオレンジ系');
assert.ok(printLayout.includes('.shift-late{background:#dbeafe;color:#172554}'), '印刷の遅出はネイビー系');
assert.ok(printLayout.includes('print-color-adjust:exact'), 'PDFでも色を保持');
assert.ok(printLayout.includes("window.open('', '_blank')") && printLayout.includes('popup.opener = null'), '印刷タブを取得後に呼び出し元との接続を切る');
assert.ok(!printLayout.includes("window.open('', '_blank', 'noopener,noreferrer')"), '印刷タブの戻り値をnullにする指定を使わない');
assert.ok(source.includes('adminPrintHtml') && exportsPage.includes('personalCalendarPrintHtml'), '画面間で共通の印刷レイアウトを使う');

console.log('Shift assignment display regression tests: PASS');
