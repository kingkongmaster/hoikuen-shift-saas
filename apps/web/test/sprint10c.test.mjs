import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [home, dashboard, styles, login, guide, serviceWorker] = await Promise.all([
  read('../src/features/dashboard/HomeDashboard.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
  read('../src/styles.css'),
  read('../src/features/auth/LoginPage.tsx'),
  read('../../../docs/enshift-design-guidelines.md'),
  read('../public/sw.js'),
]);

// ホームの情報優先順位
const priorityLabels = ['今日の勤務', '今日のお知らせ', '未読', '次回勤務'];
let previous = -1;
for (const label of priorityLabels) {
  const index = home.indexOf(label);
  assert.ok(index > previous, `${label}を指定順で表示`);
  previous = index;
}
for (const label of ['出勤', '退勤', '勤務', '確定シフト', '月間シフトを見る']) {
  assert.ok(home.includes(label), `今日の勤務に${label}を表示`);
}
assert.ok(dashboard.includes("useState<View>('home')"), 'ログイン後の初期画面はホーム');
assert.ok(dashboard.includes('よく使うメニュー') && dashboard.includes('その他のメニュー'), '日常機能と低頻度機能を整理');
assert.ok(dashboard.includes('bottom-nav md:hidden') && dashboard.includes('aria-label="主要メニュー"'), 'スマホ下部ナビゲーション');
for (const label of ['ホーム', '希望休', 'シフト', '通知']) assert.ok(dashboard.includes(`label="${label}"`), `スマホ主要メニュー: ${label}`);

// EnShift独自デザインと操作性
for (const token of ['--brand:', '--brand-deep:', '--brand-soft:', '--canvas:', '--surface:', '--ink:', '--focus:']) {
  assert.ok(styles.includes(token), `デザイントークン ${token}`);
}
assert.ok(styles.includes('font-size: 16px') && styles.includes('line-height: 1.6'), '読みやすい本文設定');
assert.ok(styles.includes('button { min-height: 44px !important; }') && styles.includes('min-h-12'), '44px以上の押下領域');
assert.ok(styles.includes(':focus-visible') && styles.includes('outline: 3px'), '視認できるキーボードフォーカス');
assert.ok(styles.includes('@media (prefers-reduced-motion: reduce)'), '動きを減らすOS設定へ対応');
assert.ok(styles.includes('@media (prefers-contrast: more)'), '高コントラスト設定へ対応');
assert.ok(dashboard.includes("matchMedia('(prefers-reduced-motion: reduce)')"), '画面遷移の動きも軽減');
assert.ok(styles.includes('grid-cols-4') && dashboard.includes('grid-cols-2') && dashboard.includes('lg:grid-cols-4'), '390pxからPCまでレスポンシブ');
assert.ok(login.includes('btn-primary') && login.includes('className="input'), 'ログイン画面も共通UI');

// 色だけに依存せず、既存デザインを模倣しない
for (const word of ['色だけで状態を区別しない', '最低44×44px', '390px', '一文字バッジ', 'SF Symbols', 'Material Icons', '模倣しない']) {
  assert.ok(guide.includes(word), `ガイドライン: ${word}`);
}
for (const symbol of ['今', '休', '勤', '知']) assert.ok(dashboard.includes(`symbol="${symbol}"`), `独自の一文字バッジ: ${symbol}`);
assert.ok(dashboard.includes('>他</span>'), '独自の一文字バッジ: 他');
assert.ok(!/from ['"](?:lucide|@mui|material-icons|@heroicons)/.test(`${home}\n${dashboard}\n${login}`), '外部アイコンライブラリを不使用');
assert.ok(!styles.includes('@font-face') && !styles.includes('fonts.googleapis.com'), '外部フォントを不使用');
assert.ok(serviceWorker.includes('enshift-shell-v11a-rc1'), 'Sprint10-C以降のPWAキャッシュ');

console.log('Sprint 10-C Web tests: PASS (ホーム優先順位・UI統一・390px・アクセシビリティ・独自ブランド・知的財産配慮)');
