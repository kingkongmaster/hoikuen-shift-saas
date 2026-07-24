import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [feedback, device, updates, pages, dashboard, footer, app, appInfo, serviceWorker] = await Promise.all([
  read('../src/features/support/FeedbackManagement.tsx'),
  read('../src/features/support/device-info.ts'),
  read('../src/features/support/UpdateHistory.tsx'),
  read('../src/features/info/PublicInfoPage.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
  read('../src/features/info/AppFooter.tsx'),
  read('../src/App.tsx'),
  read('../src/app-info.ts'),
  read('../public/sw.js'),
]);

for (const label of ['お問い合わせ', '改善要望', '不具合報告', 'ご意見', 'アプリ評価']) assert.ok(feedback.includes(label), `${label}種別`);
for (const category of ['不具合', '操作方法', 'UI', 'シフト', '通知', '希望休', '印刷', 'CSV', 'その他']) assert.ok(feedback.includes(`'${category}'`), `${category}カテゴリ`);
for (const label of ['発生日時', '操作内容', '期待した結果', '実際の結果']) assert.ok(feedback.includes(label), `${label}入力`);
for (const metadata of ['screenName', 'appVersion', 'buildNumber', 'browser', 'operatingSystem', 'viewport']) assert.ok(feedback.includes(metadata), `${metadata}自動付加`);
assert.ok(feedback.includes('window.confirm') && feedback.includes('localStorage.setItem') && feedback.includes('localStorage.getItem'), '確認ダイアログとローカル保存');
assert.ok(feedback.includes('enshift.monitorFeedback.v1:${session.tenant.id}:${session.user.id}'), '園・利用者単位の保存');
assert.ok(feedback.includes('JSON書き出し') && feedback.includes('application/json'), 'ローカル報告JSON出力');
assert.ok(feedback.includes('パスワード、園児の氏名、健康情報'), '秘密・個人情報の注意');
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
assert.ok(serviceWorker.includes('enshift-shell-v11a-rc1'), 'PWAキャッシュ更新');
assert.ok(feedback.includes('sm:grid-cols-2') && pages.includes('sm:grid-cols-2') && dashboard.includes('basis-[calc(50%-0.25rem)]'), '390/768/1024/1280レスポンシブ');

console.log('Sprint 10-B Web tests: PASS (お問い合わせ・要望・不具合・意見・評価・更新履歴・端末情報・FAQ・レスポンシブ)');
