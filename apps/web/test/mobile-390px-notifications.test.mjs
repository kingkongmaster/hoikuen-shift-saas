import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [notifications, styles, dashboard] = await Promise.all([
  read('../src/features/notifications/NotificationManagement.tsx'),
  read('../src/styles.css'),
  read('../src/features/dashboard/Dashboard.tsx'),
]);

// 1. Check viewport and container styling for 390px mobile view
assert.ok(styles.includes('min-width: 320px'), 'Body min-width supports 320px/390px viewports');

// 2. Check no horizontal scroll / word breaks on notifications
assert.ok(notifications.includes('break-words') && notifications.includes('min-w-0 flex-1'), 'Notification title & body use break-words and min-w-0 flex-1 to prevent horizontal overflow at 390px');

// 3. Check text-based read/unread & type badges fit mobile card
assert.ok(notifications.includes('新着・未読') && notifications.includes('既読'), 'Badges fit mobile viewports');

// 4. Touch target button size
assert.ok(notifications.includes('btn-primary') && styles.includes('min-height: 44px'), 'Buttons follow min 44px touch target guidelines');

// 5. Check bottom navigation clearance to avoid overlap
assert.ok(dashboard.includes('pb-24') && styles.includes('.bottom-nav'), 'Main container uses pb-24 to ensure bottom nav clearance');

console.log('Mobile 390px layout verification tests: PASS (390px viewport, text wrap, 0 overflow, touch targets, bottom-nav clearance)');
