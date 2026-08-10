import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const login = await readFile(new URL('../src/features/auth/LoginPage.tsx', import.meta.url), 'utf8');

assert.ok(login.includes('import.meta.env.DEV'), 'デモ切替は開発環境だけに限定する');
assert.ok(login.includes("useState(import.meta.env.DEV ? 'owner@demo.enshift.local' : '')") && login.includes("useState(import.meta.env.DEV ? 'ChangeMe123!' : '')"), '本番ログインフォームへデモ資格情報を初期表示しない');
assert.ok(login.includes('一般職員デモ') && login.includes('staff@demo.enshift.local'), '一般職員デモ切替を用意する');
assert.ok(login.includes('デモデータで開始（管理者）') && login.includes('owner@demo.enshift.local'), '管理者デモ切替を維持する');
assert.ok(login.includes("type=\"email\"") && login.includes("type=\"password\""), '通常ログイン入力を維持');
assert.ok(login.includes('onSubmit={submit}') && login.includes('className="btn-primary mt-6 w-full py-3"') && login.includes('ログイン'), '通常ログインボタンを維持');
assert.ok(login.includes('role="alert"'), 'ログイン失敗時のエラー表示を維持');
for (const text of ['AeN Shift', '保育園・幼稚園・認定こども園向けシフト管理システム', '先生にゆとりを、園に安心を。']) {
  assert.ok(login.includes(text), `利用者向け表示を維持: ${text}`);
}
assert.ok(login.includes('void login('), '既存デモ認証処理は削除しない');

console.log('Pilot demo login visibility tests: PASS');
