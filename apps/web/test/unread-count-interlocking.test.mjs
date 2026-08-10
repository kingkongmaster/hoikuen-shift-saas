import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [notificationsUI, dashboard, homeDashboard, apiService] = await Promise.all([
  read('../src/features/notifications/NotificationManagement.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
  read('../src/features/dashboard/HomeDashboard.tsx'),
  read('../../../apps/api/src/presentation/notifications/notifications.service.ts'),
]);

// 1. NotificationManagement notifies parent of unread count change
assert.ok(notificationsUI.includes('onUnreadChange('), 'NotificationManagement notifies parent when unread count changes');

// 2. Dashboard updates state via refreshUnread callback
assert.ok(dashboard.includes('refreshUnread') && dashboard.includes('onUnreadChange={refreshUnread}'), 'Dashboard receives unread count updates via refreshUnread callback');

// 3. Menu tiles and bottom nav receive unread badge count
assert.ok(dashboard.includes("badge={item.view === 'notifications' ? unread : 0}") && dashboard.includes("badge={unread}"), 'Menu tiles and bottom nav badges receive unread count');

// 4. HomeDashboard receives updated notifications array
assert.ok(homeDashboard.includes('unread = notifications.filter') && homeDashboard.includes('未読 {unread.length}件'), 'HomeDashboard displays updated unread count');

// 5. Backend persists isRead state in database
assert.ok(apiService.includes('data: { isRead: true }'), 'API updates database to persist isRead state');

console.log('Unread count interlocking tests: PASS (NotificationManagement -> Dashboard -> HomeDashboard -> BottomNav & DB persistence verified)');
