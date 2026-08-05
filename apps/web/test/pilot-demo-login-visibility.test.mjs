import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const login = await readFile(new URL('../src/features/auth/LoginPage.tsx', import.meta.url), 'utf8');

const hiddenDemoSection = login.indexOf('<div className="hidden">');
const demoButton = login.indexOf('デモデータで開始');
const hiddenDemoSectionEnd = login.indexOf('</div>', demoButton);
assert.ok(hiddenDemoSection >= 0 && demoButton > hiddenDemoSection && hiddenDemoSectionEnd > demoButton, 'デモ案内全体を利用者画面とキーボード操作から除外する');
assert.ok(login.includes("type=\"email\"") && login.includes("type=\"password\""), '通常ログイン入力を維持');
assert.ok(login.includes('onSubmit={submit}') && login.includes('className="btn-primary mt-6 w-full py-3"') && login.includes('ログイン'), '通常ログインボタンを維持');
assert.ok(login.includes('role="alert"'), 'ログイン失敗時のエラー表示を維持');
for (const text of ['AeN Shift', '保育園・幼稚園・認定こども園向けシフト管理システム', '先生にゆとりを、園に安心を。']) {
  assert.ok(login.includes(text), `利用者向け表示を維持: ${text}`);
}
assert.ok(login.includes('void login('), '既存デモ認証処理は削除しない');

console.log('Pilot demo login visibility tests: PASS');
