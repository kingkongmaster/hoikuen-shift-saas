import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [onboarding, gate, admin, home, dashboard, states, status, requests, swaps, client, philosophy, readme, styles, worker, errorBoundary] = await Promise.all([
  read('../src/features/onboarding/FirstLoginExperience.tsx'),
  read('../src/features/setup/SetupGate.tsx'),
  read('../src/features/dashboard/AdminHomeSummary.tsx'),
  read('../src/features/dashboard/HomeDashboard.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
  read('../src/components/UiStates.tsx'),
  read('../src/components/AppStatusLayer.tsx'),
  read('../src/features/requests/RequestManagement.tsx'),
  read('../src/features/shift-swaps/ShiftSwapManagement.tsx'),
  read('../src/api/client.ts'),
  read('../../../docs/developer-philosophy.md'),
  read('../../../README.md'),
  read('../src/styles.css'),
  read('../public/sw.js'),
  read('../src/components/ErrorBoundary.tsx'),
]);

// 初回ログインと3画面以内のガイド
for (const text of ['ようこそ', 'EnShiftへようこそ', 'はじめる', 'ガイドをスキップ', 'ホームを見る']) assert.ok(onboarding.includes(text), `初回体験: ${text}`);
for (const lesson of ['今日の勤務', '希望休', '通知']) assert.ok(onboarding.includes(`title: '${lesson}'`), `チュートリアル: ${lesson}`);
assert.equal((onboarding.match(/title: '/g) ?? []).length, 3, 'チュートリアルは3画面');
assert.ok(onboarding.includes('enshift.onboarding.completed:${session.tenant.id}:${session.user.id}'), '園・利用者単位で完了状態を保存');
assert.ok(onboarding.includes('localStorage.setItem') && onboarding.includes('localStorage.getItem'), '途中の再表示を防止');
assert.ok(gate.includes('<FirstLoginExperience session={session}>'), '初期設定後に初回体験を表示');

// ロール別ホーム
for (const label of ['今日の承認待ち', '希望休件数', '通知件数', '交換申請件数', '未確認のお知らせ']) assert.ok(admin.includes(label), `管理者ホーム: ${label}`);
assert.ok(admin.includes('api.requests') && admin.includes('api.shiftSwaps'), '既存APIで管理者集計');
assert.ok(home.includes("session.role === 'ADMIN' || session.role === 'DIRECTOR'"), '集計カードの管理者・園長制御');
for (const label of ['今日の勤務', '次回勤務', '未読', '今日のお知らせ']) assert.ok(home.includes(label), `一般職員ホーム: ${label}`);
assert.ok(dashboard.includes("useState<View>('home')"), 'ホームを初期表示');

// 空状態・読み込み・オフライン
assert.ok(states.includes('SkeletonState') && states.includes('skeleton-card'), '共通スケルトン');
assert.ok(states.includes("symbol = '空'") && states.includes('empty-symbol'), 'アイコン付き共通空状態');
assert.ok(requests.includes('希望休はまだありません') && requests.includes('希望休を申請'), '希望休の空状態と操作案内');
assert.ok(swaps.includes('交換申請はまだありません') && swaps.includes('上の入力欄'), '交換申請の空状態と操作案内');
assert.ok(status.includes('現在オフラインです') && status.includes('通信が回復しました'), '切断・回復メッセージ');
assert.ok(status.includes("window.addEventListener('offline'") && status.includes("window.addEventListener('online'"), 'オンライン状態イベント');

// 先生に優しい日本語と品質
assert.ok(client.includes('処理を完了できませんでした。時間をおいてもう一度お試しください。'), '共通エラー文');
assert.ok(requests.includes('申請を残す') && requests.includes('希望休を取り消す'), '結果が分かる確認操作');
assert.ok(swaps.includes('相手の先生と園からの確認をお待ちください'), '安心できる保存完了文');
assert.ok(!errorBoundary.includes('console.error') && !errorBoundary.includes('console.warn'), '不要なConsole出力なし');
assert.ok(!/console\.(log|warn|error|debug)/.test(`${onboarding}\n${admin}\n${home}\n${dashboard}\n${states}\n${status}\n${requests}\n${swaps}`), '追加UIにConsole出力なし');

// Philosophy・レスポンシブ・RC1
for (const phrase of ['システムを管理するのではなく、人を支えるためのシステムを作る', '説明書を読まなくても', '先生', 'Console Error']) assert.ok(philosophy.includes(phrase), `Developer Philosophy: ${phrase}`);
assert.ok(readme.includes('[EnShift Developer Philosophy](docs/developer-philosophy.md)'), 'READMEから参照可能');
assert.ok(styles.includes('.onboarding-screen') && styles.includes('.summary-grid') && styles.includes('grid-cols-2') && styles.includes('lg:grid-cols-5'), '390px優先レスポンシブ');
assert.ok(styles.includes('body:has(.onboarding-screen) footer { display: none; }'), '初回体験では他の操作を隠す');
assert.ok(worker.includes('enshift-shell-v11a-rc1'), 'RC1 Service Workerキャッシュ');

console.log('Sprint 11-A Web tests: PASS (初回体験・3画面ガイド・ロール別ホーム・優しい文言・空状態・オフライン・Philosophy・RC1)');
