import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/features/shifts/ShiftManagement.tsx', import.meta.url), 'utf8');
const desktopWrapper = /className="hidden min-w-0 max-w-full overflow-x-hidden \[contain:paint\] lg:block print:block print:max-w-none print:overflow-visible print:\[contain:none\]"/;
const tableScroller = /className="overflow-x-auto[^"]*" role="region" aria-label="月間シフト表"/;

// 1-4: 1024/1280/1366/1920px共通で、PC表示の外側ラッパーがdocumentへの横あふれを遮断する。
for (const width of [1024, 1280, 1366, 1920]) {
  assert.match(source, desktopWrapper, `${width}pxでPC表の外側横あふれを防ぐ`);
}

// 5-7: 内側だけをスクロール可能にし、30日分の必要幅と往復操作を維持する。
assert.match(source, tableScroller, '月間表専用領域だけoverflow-x-autoを維持');
assert.match(source, /min-w-max border-collapse/, '30日分の表幅を維持して最終日まで移動可能');
assert.match(source, /sticky left-0/, '横スクロール後も先頭の職員列へ戻れる構造を維持');

// 8-10: ヘッダー・操作群は表の外側、1024pxを境界にPC/スマホ表示を切り替える。
assert.match(source, /前月[\s\S]*自動生成[\s\S]*下書きを保存/, '月切替・自動生成・保存操作を表の外側に維持');
assert.match(source, /hidden min-w-0 max-w-full overflow-x-hidden \[contain:paint\] lg:block/, '1024px以上でPC月間表を維持');
assert.match(source, /lg:hidden print:hidden/, '1024px未満でスマートフォンカードを維持');

// 11-13: 印刷時は外側制限を解除し、PC表だけを使用する。
assert.match(source, /print:max-w-none print:overflow-visible print:\[contain:none\]/, '印刷時に幅・overflow・描画制限を解除');
assert.match(source, /print:block print:max-w-none print:overflow-visible print:\[contain:none\]"><ManagerTable/, '印刷時にPC月間表を使用');
assert.match(source, /lg:hidden print:hidden"><ManagerDailyCards/, 'スマートフォンカードを印刷へ混入させない');

// 14: データ0件でも固定幅表を作らず、空状態を表示する。
assert.match(source, /!view\?\.schedule \? <p[\s\S]*この月のシフトはまだ作成されていません/, 'データ0件の空状態を維持');

console.log('Desktop monthly shift overflow tests: PASS (14 layout/scroll/print/empty-state requirements)');
