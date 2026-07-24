import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import packageJson from '../package.json' with { type: 'json' };

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [footer, pages, subscription, dashboard, appInfo, client, wizard, settings] = await Promise.all([
  read('../src/features/info/AppFooter.tsx'),
  read('../src/features/info/PublicInfoPage.tsx'),
  read('../src/features/subscription/SubscriptionInfo.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
  read('../src/app-info.ts'),
  read('../src/api/client.ts'),
  read('../src/features/setup/SetupWizard.tsx'),
  read('../src/features/settings/ShiftSettings.tsx'),
]);

for (const [hash, label] of [['#terms', '利用規約'], ['#privacy', 'プライバシーポリシー'], ['#contact', 'お問い合わせ'], ['#help', 'ヘルプ']]) {
  assert.ok(footer.includes(`href: '${hash}'`) && footer.includes(`label: '${label}'`), `${label}リンク`);
}
assert.ok(footer.includes('#about') && footer.includes('Version'), 'Versionからアプリ情報へ遷移');
for (const title of ['利用規約', 'プライバシーポリシー', 'お問い合わせ窓口', 'よくあるご質問', 'アプリ情報']) assert.ok(pages.includes(title), `${title}画面`);
for (const faq of ['ログインできない', 'パスワードを忘れた', '希望休を登録したい', '自分のシフトを確認したい', 'CSVを出力したい', 'PDFで保存したい']) assert.ok(pages.includes(faq), `${faq} FAQ`);
assert.ok(pages.includes('max-h-[60vh]') && pages.includes('overflow-y-auto'), '規約画面はスクロール可能');
for (const label of ['契約プラン', '契約状態', 'Trial終了日', '契約開始日', '職員上限', '現在登録人数']) assert.ok(subscription.includes(label), `${label}表示`);
assert.ok(client.includes("'/subscription'"), '既存契約APIへ接続');
assert.ok(dashboard.includes("view === 'subscription' && canManageShifts"), '契約画面は管理者・園長のみ');
assert.ok(appInfo.includes('packageJson.version') && packageJson.version, 'package versionを表示');
assert.ok(footer.includes('md:flex-row') && subscription.includes('sm:grid-cols-2') && subscription.includes('lg:grid-cols-3'), 'PC・タブレット・スマホ対応');
assert.ok(wizard.includes('contactName: draft.tenant.directorName.trim()'), '園長氏名をSetup APIへ保存');
assert.ok(wizard.includes('saturdayOperationEnabled: draft.saturdayCareEnabled'), '土曜保育booleanをSetup APIへ保存');
assert.ok(settings.includes('土曜保育を行う'), '園設定から土曜保育booleanを変更可能');
assert.ok(settings.includes('土曜最低勤務人数') && settings.includes('早出・遅出を優先'), '土曜最低人数と配置優先順を設定可能');

console.log('Sprint 9-C Web tests: PASS (各画面・リンク・権限制御・レスポンシブ・契約・Version)');
