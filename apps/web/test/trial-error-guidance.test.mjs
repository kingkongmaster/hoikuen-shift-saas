import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [client, status, boundary, login, dashboard, notifications, shifts] = await Promise.all([
  read('../src/api/client.ts'),
  read('../src/components/AppStatusLayer.tsx'),
  read('../src/components/ErrorBoundary.tsx'),
  read('../src/features/auth/LoginPage.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
  read('../src/features/notifications/NotificationManagement.tsx'),
  read('../src/features/shifts/ShiftManagement.tsx'),
]);

const contactGuidance = '操作を繰り返さず、画面の内容を記録して管理者へ連絡してください。';
assert.ok(client.includes(contactGuidance), 'API停止・内部エラー時に次の行動を案内');
assert.ok(client.includes('if (status === 401 || status >= 500) return fallbackMessage(status);'), '認証切れ・内部エラーの技術的な本文を画面へ出さない');
assert.ok(boundary.includes(contactGuidance), '画面例外にも次の行動を案内');
assert.ok(!boundary.includes('ERROR {code}'), 'HTTPエラーコードを園向け画面へ表示しない');

assert.ok(login.includes("window.dispatchEvent(new CustomEvent('enshift:clear-error'))"), '正常ログイン時に過去エラーを消去');
assert.ok(status.includes("window.addEventListener('enshift:clear-error', clearError)"), '共通エラー表示が消去イベントに対応');

assert.ok(shifts.includes('職員マスターの勤務条件、希望休、園設定をご確認ください。'), '生成失敗時の確認場所を案内');
assert.ok(shifts.includes('未設定の勤務条件を確認する'), '未設定職員を個別に案内');
for (const item of ['月間目標日数', '月間目標時間', '勤務できる区分']) {
  assert.ok(shifts.includes(item), `未設定項目: ${item}`);
}

assert.ok(!dashboard.includes('setNotifications((rows) => {\n      void api.notifications'), '状態更新中にAPI通信を開始しない');
assert.ok(!notifications.includes('setRows((current) => {\n        const updated'), '状態更新中に親画面を更新しない');

console.log('Trial error guidance tests: PASS (障害案内・ログインエラー消去・生成案内・React警告防止)');
