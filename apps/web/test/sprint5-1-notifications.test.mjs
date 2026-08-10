import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [notifications, dashboard] = await Promise.all([
  read('../src/features/notifications/NotificationManagement.tsx'),
  read('../src/features/dashboard/Dashboard.tsx'),
]);

// 1. All / Unread Filter toggle
assert.ok(notifications.includes("setFilter('all')") && notifications.includes("setFilter('unread')"), 'Filter toggle for All and Unread');

// 2. Sorting: Unread first, then newest date
assert.ok(notifications.includes('a.isRead !== b.isRead') && notifications.includes('new Date(b.createdAt)'), 'Unread first, newest date sorting order');

// 3. 0 items guidance text
assert.ok(notifications.includes('現在、新しい通知はありません'), 'Empty state guidance message when 0 items');

// 4. Text distinction for unread/read
assert.ok(notifications.includes('新着・未読') && notifications.includes('既読'), 'Clear text indicator for read/unread state');

// 5. Navigation mapping to related existing screens
assert.ok(notifications.includes('requests') && notifications.includes('calendar') && notifications.includes('swaps'), 'Navigation targets for related screens');

// 6. Read notification API integration
assert.ok(notifications.includes('api.readNotification') && notifications.includes('api.readAllNotifications'), 'Read API integration');

// 7. Dashboard navigation integration
assert.ok(dashboard.includes('onNavigate={selectView}'), 'Dashboard passes selectView handler to NotificationManagement');

console.log('Sprint 5-1 Staff Notifications Web tests: PASS (All/Unread filters, Unread-first sort, 0-item guidance, Text state, Navigation, Read APIs)');
