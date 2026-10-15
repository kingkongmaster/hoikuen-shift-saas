import assert from 'node:assert/strict';
import { profileDraft, profilePatch } from '../src/features/setup/profile-mapping.js';
import { readFile } from 'node:fs/promises';
import packageJson from '../package.json' with { type: 'json' };

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [footer, pages, subscription, dashboard, appInfo, client, wizard, settings, legal] = await Promise.all([
  read('../src/features/info/AppFooter.tsx'),
  read('../src/features/info/PublicInfoPage.tsx'),
  read('../src/features/subscription/SubscriptionInfo.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
  read('../src/app-info.ts'),
  read('../src/api/client.ts'),
  read('../src/features/setup/SetupWizard.tsx'),
  read('../src/features/settings/ShiftSettings.tsx'),
  read('../src/features/legal/LegalDocument.tsx'),
]);

for (const [hash, label] of [['#terms', '利用規約'], ['#privacy', 'プライバシーポリシー'], ['#contact', 'お問い合わせ'], ['#help', 'ヘルプ']]) {
  assert.ok(footer.includes(`href: '${hash}'`) && footer.includes(`label: '${label}'`), `${label}リンク`);
}
assert.ok(footer.includes('#about') && footer.includes('Version'), 'Versionからアプリ情報へ遷移');
for (const title of ['利用規約', 'プライバシーポリシー', 'お問い合わせ窓口', 'よくあるご質問', 'アプリ情報']) assert.ok(pages.includes(title), `${title}画面`);
for (const faq of ['ログインできない', 'パスワードを忘れた', '希望休を登録したい', '自分のシフトを確認したい', 'CSVを出力したい', 'PDFで保存したい']) assert.ok(pages.includes(faq), `${faq} FAQ`);
// Public documents use page scrolling; the setup reader uses a bounded dialog.
for (const kind of ['terms', 'privacy']) assert.ok(pages.includes(`<LegalDocument kind="${kind}" />`), `${kind}: shared full document`);
assert.ok(legal.includes('doc.sections.map') && legal.includes('s.text'), '全条項の本文を共通部品で描画');
assert.match(legal, /<dialog[\s\S]*?className="[^"]*max-h-\[90dvh\][^"]*overflow-y-auto/, '同意画面の本文dialogは端末高に収まりスクロール可能');
assert.ok(legal.includes('ref.current?.showModal()') && legal.includes('method="dialog"') && legal.includes('opener.current?.focus()'), '本文を開く・閉じる・フォーカス復帰を維持');
for (const label of ['契約プラン', '契約状態', '試用終了日', '契約開始日', '職員上限', '現在登録人数']) assert.ok(subscription.includes(label), `${label}表示`);
assert.ok(subscription.includes('label="試用終了日" value={date(subscription.trialEndsAt)}'), '試用終了日は実契約の期限を表示');
assert.ok(client.includes("'/subscription'"), '既存契約APIへ接続');
assert.ok(dashboard.includes("view === 'subscription' && canManageShifts"), '契約画面は管理者・園長のみ');
assert.ok(appInfo.includes('packageJson.version') && packageJson.version, 'package versionを表示');
assert.ok(footer.includes('md:flex-row') && subscription.includes('sm:grid-cols-2') && subscription.includes('lg:grid-cols-3'), 'PC・タブレット・スマホ対応');
assert.ok(wizard.includes('profileDraft(setup)') && wizard.includes('profilePatch(setup, draft.tenant)') && wizard.includes('api.updateSetupTenant(session.accessToken, patch)'), '現在のprofile mappingをSetup保存へ接続');
const profile = {name:'匿名園',contactEmail:'anonymous@example.invalid',contactName:'匿名管理者',phone:null};
const draft = profileDraft(profile);
assert.equal(draft.contactName, profile.contactName);
assert.equal(profilePatch(profile, draft), null, '確認だけでは書き換えない');
assert.deepEqual(profilePatch(profile,{...draft,contactName:'  匿名管理者B  '}), {name:profile.name,contactEmail:profile.contactEmail,contactName:'匿名管理者B'}, '編集した園長氏名をtrimして保存し、他項目を上書きしない');
assert.ok(wizard.includes('saturdayOperationEnabled: draft.saturdayCareEnabled'), '土曜保育booleanをSetup APIへ保存');
assert.ok(settings.includes('土曜保育を行う'), '園設定から土曜保育booleanを変更可能');
assert.ok(settings.includes('土曜最低勤務人数') && settings.includes('早出・遅出を優先'), '土曜最低人数と配置優先順を設定可能');

console.log('Sprint 9-C Web tests: PASS (各画面・リンク・権限制御・レスポンシブ・契約・Version)');
