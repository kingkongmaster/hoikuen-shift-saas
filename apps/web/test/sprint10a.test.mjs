import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [manifestText, serviceWorker, html, main, styles, states, status, errorBoundary, login, dashboard, notifications, exportsPage, footer, installPrompt, subscription] = await Promise.all([
  read('../public/manifest.json'),
  read('../public/sw.js'),
  read('../index.html'),
  read('../src/main.tsx'),
  read('../src/styles.css'),
  read('../src/components/UiStates.tsx'),
  read('../src/components/AppStatusLayer.tsx'),
  read('../src/components/ErrorBoundary.tsx'),
  read('../src/features/auth/LoginPage.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
  read('../src/features/notifications/NotificationManagement.tsx'),
  read('../src/features/exports/DataExportManagement.tsx'),
  read('../src/features/info/AppFooter.tsx'),
  read('../src/features/info/InstallPrompt.tsx'),
  read('../src/features/subscription/SubscriptionInfo.tsx'),
]);
const manifest = JSON.parse(manifestText);
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.name, 'EnShift 保育園シフト管理');
assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose.includes('maskable')));
for (const file of ['../public/icons/icon-192.png', '../public/icons/icon-512.png', '../public/icons/apple-touch-icon.png', '../public/icons/splash-1170x2532.png']) {
  assert.ok((await stat(new URL(file, import.meta.url))).size > 1000, `${file} asset`);
}
assert.ok(serviceWorker.includes("'/offline.html'") && serviceWorker.includes("url.pathname.startsWith('/api/')"), 'offline fallback and API exclusion');
assert.ok(serviceWorker.includes('skipWaiting') && serviceWorker.includes('clients.claim'), 'service worker lifecycle');
assert.ok(html.includes('rel="manifest"') && html.includes('apple-mobile-web-app-capable') && html.includes('apple-touch-startup-image'), 'install/home/splash meta');
assert.ok(main.includes("navigator.serviceWorker.register('/sw.js')") && main.includes('import.meta.env.PROD'), 'production service worker registration');
for (const token of ['.btn-primary', '.btn-secondary', '.btn-danger', '.card', '.input', '.message-success', '.message-error']) assert.ok(styles.includes(token), token);
for (const component of ['LoadingState', 'EmptyState', 'MessageBanner', 'ErrorState']) assert.ok(states.includes(`function ${component}`), component);
assert.ok(status.includes("enshift:api-start") && status.includes('navigator.onLine') && status.includes('オフラインです'), 'global loading/offline/toast');
for (const code of ['404', '500', '403']) assert.ok(errorBoundary.includes(code), `${code} error`);
assert.ok(login.includes('デモデータで開始') && login.includes('owner@demo.enshift.local'), 'demo launch');
assert.ok(dashboard.includes('basis-[calc(50%-0.25rem)]') && dashboard.includes('api.notifications'), '390px menu and unread badge');
assert.ok(notifications.includes('未読 {unread}件') && notifications.includes('EmptyState') && notifications.includes('LoadingState'), 'notification states/count');
for (const label of ['園全体 印刷／PDF', '個人 印刷／PDF', 'クラス別 印刷／PDF', '職員一覧CSV', '希望休CSV', '月間シフトCSV', '監査ログCSV', 'JSON Export', 'JSON Import']) assert.ok(exportsPage.includes(label), label);
assert.ok(exportsPage.includes('classLabels[classFilter]'), 'class print filter label conversion');
assert.ok(exportsPage.includes("window.open('', '_blank')") && exportsPage.includes('popup.opener = null'), 'print popup handle and opener isolation');
assert.ok(footer.includes('InstallPrompt') && installPrompt.includes('beforeinstallprompt') && installPrompt.includes('ホーム画面に追加'), 'install UI');
for (const breakpoint of ['sm:', 'md:', 'lg:']) assert.ok(styles.includes('@tailwind') && (dashboard.includes(breakpoint) || footer.includes(breakpoint) || subscription.includes(breakpoint)), `${breakpoint} responsive`);

console.log('Sprint 10-A Web tests: PASS (PWA・Install・UI状態・デモ導線・通知・出力・390/768/1024/1280対応)');
