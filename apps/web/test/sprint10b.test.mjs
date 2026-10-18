import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [feedback, device, updates, pages, dashboard, footer, app, appInfo] = await Promise.all([
  read('../src/features/support/FeedbackManagement.tsx'),
  read('../src/features/support/device-info.ts'),
  read('../src/features/support/UpdateHistory.tsx'),
  read('../src/features/info/PublicInfoPage.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
  read('../src/features/info/AppFooter.tsx'),
  read('../src/App.tsx'),
  read('../src/app-info.ts'),
]);

// Phase 6 intentionally replaces local-only drafts with delivered server tickets.
// HTTP authorization, delivery/replies and responsive interaction are exercised
// by product-phase6-operations/browser against anonymous tenants.
for(const label of ['お問い合わせ','改善要望','不具合','操作方法','契約','その他','運営へ送信','返信を送信']) assert.ok(feedback.includes(label));
assert.ok(feedback.includes('/support/tickets') && feedback.includes('/platform/support'));
assert.ok(!feedback.includes('localStorage.setItem'), 'do not claim local storage is delivery');
assert.ok(feedback.includes('送信が完了') && feedback.includes('受付番号'));
assert.ok(feedback.includes('職員・園児の氏名、健康情報、パスワード、招待情報'));
assert.ok(feedback.includes('fromOperator') && feedback.includes('RESOLVED'));
for (const browser of ['Microsoft Edge', 'Google Chrome', 'Firefox', 'Safari']) assert.ok(device.includes(browser), `${browser}判別`);

assert.ok(dashboard.includes("feedback: { title: 'お問い合わせ'") && dashboard.includes("updates: { title: '更新履歴'"), 'ログイン後メニュー');
assert.ok(dashboard.includes("<FeedbackManagement session={session}") && dashboard.includes('<UpdateHistory />'), '全ロールで画面表示');
assert.ok(updates.includes('RELEASES') && updates.includes('モニター園運用支援') && updates.includes('Sprint 10-A'), '拡張可能な更新履歴');
for (const field of ['Version', 'Build', '最終更新日', '開発者', 'Browser', 'OS / 画面', 'Copyright']) assert.ok(pages.includes(field), `${field}表示`);
for (const faq of ['ログインできない', '希望休を登録したい', '通知について知りたい', 'シフト交換を申請したい', '印刷したい', 'PDFで保存したい', 'バックアップを取得したい', '改善要望や不具合を報告したい', 'ホーム画面へ追加したい']) assert.ok(pages.includes(faq), `${faq} FAQ`);
assert.ok((pages.match(/^\s*\['/gm) ?? []).length >= 10, 'FAQ 10項目以上');
for (const hash of ['#contact', '#support', '#help', '#updates']) assert.ok(footer.includes(hash), `${hash}フッターリンク`);
assert.ok(app.includes("'support'") && app.includes("'updates'"), '公開ルート');
assert.ok(appInfo.includes("APP_BUILD") && !appInfo.includes("?? 'local'") && appInfo.includes('APP_LAST_UPDATED') && appInfo.includes('APP_DEVELOPER'), '製品Build・更新日・開発者');
// Verify update/retired-cache behavior rather than a historical cache name.
await import('./pwa-shell.test.mjs');
assert.ok(feedback.includes('min-w-0') && pages.includes('sm:grid-cols-2') && dashboard.includes('basis-[calc(50%-0.25rem)]'), '390/768/1024/1280レスポンシブ');

console.log('Sprint 10-B Web tests: PASS (お問い合わせ・要望・不具合・意見・評価・更新履歴・端末情報・FAQ・レスポンシブ)');
