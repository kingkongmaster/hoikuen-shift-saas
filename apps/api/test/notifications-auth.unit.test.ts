import assert = require('node:assert/strict');
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../src/presentation/notifications/notifications.service';

const user = { sub: 'user-own-123', tenantId: 'tenant-own-456', role: 'STAFF' as const, email: 'staff@example.test', displayName: '一般職員' };

async function main() {
  const queries: any[] = [];
  const mockNotifications = [
    { id: 'notif-1', tenantId: 'tenant-own-456', memberId: 'user-own-123', type: 'SHIFT_CONFIRMED', title: 'シフト確定のお知らせ', message: '8月のシフトが確定しました。', isRead: false, createdAt: new Date() },
    { id: 'notif-2', tenantId: 'tenant-own-456', memberId: 'user-own-123', type: 'REQUEST_APPROVED', title: '希望休承認', message: '希望休が承認されました。', isRead: true, createdAt: new Date() },
  ];

  const prismaMock: any = {
    notification: {
      findMany: async (args: any) => {
        queries.push(['findMany', args]);
        return mockNotifications.filter((n) => n.tenantId === args.where.tenantId && n.memberId === args.where.memberId);
      },
      findFirst: async (args: any) => {
        queries.push(['findFirst', args]);
        return mockNotifications.find((n) => n.id === args.where.id && n.tenantId === args.where.tenantId && n.memberId === args.where.memberId) || null;
      },
      update: async (args: any) => {
        queries.push(['update', args]);
        return { ...mockNotifications[0], isRead: true };
      },
      updateMany: async (args: any) => {
        queries.push(['updateMany', args]);
        return { count: 1 };
      },
    },
  };

  const service = new NotificationsService(prismaMock);

  // 1 & 2 & 3: List own notifications in own tenant
  const listResult = await service.list(user as any);
  assert.equal(listResult.length, 2);
  const listQuery = queries.find((q) => q[0] === 'findMany')[1];
  assert.equal(listQuery.where.tenantId, 'tenant-own-456', '他Tenantの通知を取得しない');
  assert.equal(listQuery.where.memberId, 'user-own-123', '他職員の通知を取得しない（本人限定）');

  // 7: Check no admin-only fields in notification response schema
  for (const item of listResult) {
    assert.equal('adminNotes' in item, false, '管理者備考が含まれない');
    assert.equal('hourlyWage' in item, false, '契約・給与等管理情報が含まれない');
  }

  // 4 & 5: Read single notification authorization
  queries.length = 0;
  await service.read(user as any, 'notif-1');
  const readFindFirst = queries.find((q) => q[0] === 'findFirst')[1];
  assert.equal(readFindFirst.where.id, 'notif-1');
  assert.equal(readFindFirst.where.tenantId, 'tenant-own-456', '既読処理時に他Tenant通知を変更不可');
  assert.equal(readFindFirst.where.memberId, 'user-own-123', '既読処理時に他職員通知を変更不可');

  // Throws NotFoundException if notification belongs to another user or another tenant
  await assert.rejects(
    () => service.read(user as any, 'other-user-notif'),
    NotFoundException,
    '他人の通知または他テナントの通知は既読化できず404エラーになる'
  );

  // 6: Read-all bounds
  queries.length = 0;
  await service.readAll(user as any);
  const readAllQuery = queries.find((q) => q[0] === 'updateMany')[1];
  assert.equal(readAllQuery.where.tenantId, 'tenant-own-456', 'read-allは自Tenant限定');
  assert.equal(readAllQuery.where.memberId, 'user-own-123', 'read-allは本人限定');
  assert.equal(readAllQuery.where.isRead, false, '未読のみを対象とする');

  console.log('Notification API authorization unit tests: PASS (own staff, tenant boundary, read access control, no admin info)');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
