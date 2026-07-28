import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/features/auth/InitialPasswordChangePage.tsx', import.meta.url), 'utf8');
const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8');
assert.match(app, /session\?\.mustChangePassword[\s\S]*InitialPasswordChangePage/, '通常画面より先に初回変更画面を強制');
assert.match(app, /api\.me\(token\)/, '再読込時はAPIで最新状態を確認');
assert.match(page, /currentPassword/); assert.match(page, /confirmPassword/); assert.match(page, /type=\{visible \? 'text' : 'password'\}/);
for (const state of ['currentVisible', 'newVisible', 'confirmVisible']) assert.ok(page.includes(state), `${state}で表示状態を分離`);
assert.match(page, /if \(submitting\.current\) return/, '同期ロックで二重送信を防止');
assert.match(page, /newPassword !== confirmPassword/, '入力不一致を表示');
assert.match(page, /12～128文字/); assert.match(page, /英大文字・英小文字・数字・記号/);
assert.match(page, /w-full max-w-md/); assert.match(page, /p-4 sm:p-5/, '390px幅でも横幅と余白を維持');
assert.match(page, /sessionStorage\.removeItem\('enshift\.accessToken'\)/, '成功後tokenを破棄して再ログイン');
assert.match(page, /catch \(reason\) \{ setCurrentPassword\(''\)/, 'API失敗時に仮パスワードを消去');
assert.doesNotMatch(page, /setItem\([^)]*[Pp]assword/, 'パスワードをstorageへ保存しない');
assert.match(client, /changeInitialPassword/); assert.match(client, /mustChangePassword: boolean/);
console.log('Initial password change web tests: PASS (routing, validation, storage and re-login)');
