import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/features/staff/StaffLoginAccountManagement.tsx', import.meta.url), 'utf8');

assert.match(page, /window\.confirm\(`\$\{staff\.displayName\}さんへ「\$\{roleLabel\}」権限でログインを発行しますか/,
  '発行前に職員名と権限を明示して人間確認する');
assert.match(page, /role==='DIRECTOR'.*園長権限では管理機能を利用できます/,
  'DIRECTOR発行には管理権限の追加警告を表示する');
assert.match(page, /if\(busy\)return/, '同期的な送信中ガードを持つ');
assert.match(page, /disabled=\{busy\}/, '送信中は操作ボタンを無効化する');
assert.match(page, /setPassword\(''\);setConfirm\(''\)/, '送信後に仮パスワード入力を消去する');
assert.doesNotMatch(page, /(?:localStorage|sessionStorage)\.setItem\([^)]*[Pp]assword/,
  '仮パスワードをブラウザの永続領域へ保存しない');

console.log('Staff login account web tests: PASS (role confirmation, double-submit guard and password handling)');
