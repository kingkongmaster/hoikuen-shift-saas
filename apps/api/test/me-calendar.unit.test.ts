import assert = require('node:assert/strict');
import { ForbiddenException } from '@nestjs/common';
import { MeService } from '../src/presentation/me/me.service';

const user = { sub: 'user-own', tenantId: 'tenant-own', role: 'STAFF' as const, email: 'staff@example.test', displayName: '本人' };
const calls: any[] = [];
const prisma: any = {
  staff: { findUnique: async (args: any) => { calls.push(['staff', args]); return { id: 'staff-own', employeeNumber: '001', displayName: '本人', email: 'staff@example.test', jobTitle: '保育士', employmentType: 'FULL_TIME', assignedClass: 'AGE_0', isActive: true }; } },
  monthlyShift: { findUnique: async (args: any) => { calls.push(['shift', args]); return { id: 'shift-own', status: 'CONFIRMED', targetMonth: new Date('2026-08-01T00:00:00Z'), confirmedAt: new Date('2026-07-25T00:00:00Z'), assignments: [{ id: 'assignment-own', staffId: 'staff-own', workDate: new Date('2026-08-05T00:00:00Z'), shiftType: 'EARLY', startTime: '07:00', endTime: '16:00', breakMinutes: 60, assignedClass: 'AGE_0', updatedAt: new Date('2026-07-24T00:00:00Z'), workPattern: null }] }; } },
  shiftRequest: { findMany: async (args: any) => { calls.push(['request', args]); return [{ id: 'request-own', requestDate: new Date('2026-08-12T00:00:00Z'), requestType: 'DAY_OFF', status: 'PENDING', reason: null, updatedAt: new Date() }]; } },
};

async function main() {
const service = new MeService(prisma as any);
const result = await service.calendar(user as any, '2026-08');
assert.equal(result.staff.id, 'staff-own');
assert.equal(result.assignments.length, 1);
assert.equal(result.requests.length, 1);
assert.deepEqual(calls[0][1].where, { tenantId_userId: { tenantId: 'tenant-own', userId: 'user-own' } }, 'JWTのtenantIdとuserIdから本人Staffを決定する');
assert.equal(calls[1][1].where.tenantId_targetMonth.tenantId, 'tenant-own', '月間シフトをTenant内に限定する');
assert.equal(calls[1][1].select.assignments.where.staffId, 'staff-own', '本人の勤務だけを選択する');
assert.equal(calls[2][1].where.tenantId, 'tenant-own', '希望休をTenant内に限定する');
assert.equal(calls[2][1].where.staffId, 'staff-own', '本人の希望休だけを選択する');
assert.equal('notes' in result.staff, false, '管理者用備考を返さない');
assert.equal('monthlyWorkHourLimit' in result.staff, false, '個別勤務条件を返さない');

prisma.monthlyShift.findUnique = async () => ({ id: 'draft', status: 'DRAFT', targetMonth: new Date('2026-08-01T00:00:00Z'), confirmedAt: null, assignments: [{ id: 'hidden' }] }) as any;
const draft = await service.calendar(user as any, '2026-08');
assert.deepEqual(draft.assignments, [], '未確定明細は一般職員へ公開しない');
assert.equal(draft.schedule?.status, 'DRAFT', '未確定という状態だけを返す');

prisma.staff.findUnique = async () => null;
await assert.rejects(() => service.calendar(user as any, '2026-08'), ForbiddenException, '紐付く有効Staffがなければ拒否する');
console.log('Me calendar authorization unit tests: PASS (own staff, tenant boundary, draft privacy, safe profile)');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
