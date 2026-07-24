const { AssignedClass, EmploymentType, MembershipRole, MonthlyShiftStatus, PrismaClient, ShiftRequestStatus, ShiftRequestType, ShiftType } = require('@prisma/client');
const { randomBytes, scryptSync } = require('node:crypto');

const prisma = new PrismaClient();

function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

async function main() {
  if (process.env.SEED_DEMO_DATA !== 'true') return;
  const email = (process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local').toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!';
  const tenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { name: 'デモこども園', contactName: '園長 デモ花子', contactEmail: 'director@demo.enshift.local', phone: '03-1234-5678', postalCode: '100-0001', addressLine: '東京都千代田区千代田1-1' },
    create: { id: '00000000-0000-4000-8000-000000000001', name: 'デモこども園', contactName: '園長 デモ花子', contactEmail: 'director@demo.enshift.local', phone: '03-1234-5678', postalCode: '100-0001', addressLine: '東京都千代田区千代田1-1' },
  });
  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  await prisma.tenantSubscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      plan: 'TRIAL',
      status: 'TRIAL',
      trialStartedAt,
      trialEndsAt,
      staffLimit: 20,
    },
  });
  const user = await prisma.user.upsert({
    where: { email },
    update: { displayName: 'デモ園長', isActive: true },
    create: { email, displayName: 'デモ園長', passwordHash: passwordHash(password) },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: MembershipRole.ADMIN, isActive: true },
    create: { tenantId: tenant.id, userId: user.id, role: MembershipRole.ADMIN },
  });
  await prisma.staff.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { employeeNumber: 'ADMIN-001', displayName: user.displayName, email: user.email, jobTitle: '園長', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.FREE, isActive: true },
    create: { tenantId: tenant.id, userId: user.id, employeeNumber: 'ADMIN-001', displayName: user.displayName, email: user.email, jobTitle: '園長', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.FREE },
  });
  await prisma.tenantShiftSetting.upsert({
    where: { tenantId: tenant.id },
    update: { saturdayOperationEnabled: true, weekdayEarlyRequired: 2, weekdayLateRequired: 2, saturdayMinimumStaff: 3, saturdayEarlyRequired: 1, saturdayLateRequired: 1, defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00', defaultStartLate: '11:00', defaultEndLate: '19:30' },
    create: { tenantId: tenant.id, saturdayOperationEnabled: true, weekdayEarlyRequired: 2, weekdayLateRequired: 2, saturdayMinimumStaff: 3, saturdayEarlyRequired: 1, saturdayLateRequired: 1, defaultStartEarly: '07:00', defaultEndEarly: '16:00', defaultStartNormal: '08:30', defaultEndNormal: '17:00', defaultStartLate: '11:00', defaultEndLate: '19:30' },
  });
  const demoClassRequirements = new Map([
    [AssignedClass.AGE_0, 2], [AssignedClass.AGE_1, 2], [AssignedClass.AGE_2, 2],
    [AssignedClass.AGE_3, 2], [AssignedClass.AGE_4, 1], [AssignedClass.AGE_5, 1],
  ]);
  for (const classType of [AssignedClass.AGE_0, AssignedClass.AGE_1, AssignedClass.AGE_2, AssignedClass.AGE_3, AssignedClass.AGE_4, AssignedClass.AGE_5]) {
    const weekdayRequired = demoClassRequirements.get(classType);
    await prisma.classStaffingRequirement.upsert({
      where: { tenantId_classType: { tenantId: tenant.id, classType } },
      update: { weekdayRequired, saturdayRequired: 0, isActive: true },
      create: { tenantId: tenant.id, classType, weekdayRequired, saturdayRequired: 0, isActive: true },
    });
  }
  await prisma.tenantClosedDate.upsert({ where: { tenantId_closedDate: { tenantId: tenant.id, closedDate: new Date('2026-08-11T00:00:00.000Z') } }, update: { name: '山の日振替休園', note: 'Sprint 6生成確認用' }, create: { tenantId: tenant.id, closedDate: new Date('2026-08-11T00:00:00.000Z'), name: '山の日振替休園', note: 'Sprint 6生成確認用' } });

  const demoStaff = [
    {
      employeeNumber: 'STAFF-001', displayName: '佐藤 ひなた', employmentType: EmploymentType.FULL_TIME,
      assignedClass: AssignedClass.AGE_0, canWorkEarly: true, canWorkRegular: true, canWorkLate: false,
      earlyShiftOnly: true, lateShiftOnly: false, canWorkSaturdays: true, monthlyWorkHourLimit: 192,
      weeklyAvailableDays: 5, jobTitle: '0歳児担任', notes: '早出専任の正規職員',
    },
    {
      employeeNumber: 'STAFF-002', displayName: '鈴木 あおい', employmentType: EmploymentType.PART_TIME,
      assignedClass: AssignedClass.AGE_0, canWorkEarly: false, canWorkRegular: true, canWorkLate: false,
      earlyShiftOnly: false, lateShiftOnly: false, canWorkSaturdays: false, monthlyWorkHourLimit: 96,
      weeklyAvailableDays: 4, jobTitle: '0歳児担任', notes: 'パート・土曜日勤務不可',
    },
    {
      employeeNumber: 'STAFF-003', displayName: '高橋 みのり', employmentType: EmploymentType.REEMPLOYED,
      assignedClass: AssignedClass.AGE_0, canWorkEarly: false, canWorkRegular: false, canWorkLate: true,
      earlyShiftOnly: false, lateShiftOnly: true, canWorkSaturdays: true, monthlyWorkHourLimit: 120,
      weeklyAvailableDays: 4, jobTitle: '0歳児担任', notes: '遅出専任の再雇用職員',
    },
    { employeeNumber: 'STAFF-005', displayName: '田中 さくら', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.AGE_1, jobTitle: '1歳児担任' },
    { employeeNumber: 'STAFF-006', displayName: '伊藤 結衣', employmentType: EmploymentType.PART_TIME, assignedClass: AssignedClass.AGE_1, jobTitle: '1歳児担任', monthlyWorkHourLimit: 120, weeklyAvailableDays: 4, canWorkSaturdays: false },
    { employeeNumber: 'STAFF-007', displayName: '渡辺 陽菜', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.AGE_2, jobTitle: '2歳児担任' },
    { employeeNumber: 'STAFF-008', displayName: '山本 莉子', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.AGE_2, jobTitle: '2歳児担任' },
    { employeeNumber: 'STAFF-009', displayName: '中村 葵', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.AGE_3, jobTitle: '3歳児担任' },
    { employeeNumber: 'STAFF-010', displayName: '小林 凛', employmentType: EmploymentType.PART_TIME, assignedClass: AssignedClass.AGE_3, jobTitle: '3歳児担任', monthlyWorkHourLimit: 120, weeklyAvailableDays: 4, canWorkSaturdays: false },
    { employeeNumber: 'STAFF-011', displayName: '加藤 芽依', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.AGE_4, jobTitle: '4歳児担任' },
    { employeeNumber: 'STAFF-012', displayName: '吉田 美月', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.AGE_5, jobTitle: '5歳児担任', notes: '土曜保育対応を含む5歳児担当' },
    { employeeNumber: 'STAFF-013', displayName: '山田 結月', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.FREE, jobTitle: '主任' },
    { employeeNumber: 'STAFF-014', displayName: '佐々木 澪', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.FREE, jobTitle: 'フリー保育士' },
  ];

  for (const member of demoStaff) {
    member.canWorkEarly ??= true;
    member.canWorkRegular ??= true;
    member.canWorkLate ??= true;
    member.earlyShiftOnly ??= false;
    member.lateShiftOnly ??= false;
    member.canWorkSaturdays ??= true;
    member.monthlyWorkHourLimit ??= 192;
    member.weeklyAvailableDays ??= 5;
    member.notes ??= 'RC1 プレゼン用デモ職員';
  }

  for (const member of demoStaff) {
    await prisma.staff.upsert({
      where: { tenantId_employeeNumber: { tenantId: tenant.id, employeeNumber: member.employeeNumber } },
      update: { ...member, isActive: true },
      create: { tenantId: tenant.id, ...member },
    });
  }

  const staffLoginEmail = 'staff@demo.enshift.local';
  const staffLoginPassword = process.env.SEED_STAFF_PASSWORD || 'ChangeMe123!';
  const staffUser = await prisma.user.upsert({
    where: { email: staffLoginEmail },
    update: { displayName: 'デモ一般職員', isActive: true },
    create: { email: staffLoginEmail, displayName: 'デモ一般職員', passwordHash: passwordHash(staffLoginPassword) },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: staffUser.id } },
    update: { role: MembershipRole.STAFF, isActive: true },
    create: { tenantId: tenant.id, userId: staffUser.id, role: MembershipRole.STAFF },
  });
  await prisma.staff.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: staffUser.id } },
    update: { employeeNumber: 'STAFF-004', displayName: staffUser.displayName, email: staffUser.email, jobTitle: '保育補助', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.SUPPORT, isActive: true },
    create: { tenantId: tenant.id, userId: staffUser.id, employeeNumber: 'STAFF-004', displayName: staffUser.displayName, email: staffUser.email, jobTitle: '保育補助', employmentType: EmploymentType.FULL_TIME, assignedClass: AssignedClass.SUPPORT },
  });
  const activeDemoEmployeeNumbers = ['ADMIN-001', ...Array.from({ length: 14 }, (_, index) => `STAFF-${String(index + 1).padStart(3, '0')}`)];
  await prisma.staff.updateMany({
    where: { tenantId: tenant.id, employeeNumber: { notIn: activeDemoEmployeeNumbers } },
    data: { isActive: false },
  });

  const seededStaff = await prisma.staff.findMany({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, employeeNumber: true, assignedClass: true, canWorkEarly: true, canWorkRegular: true, canWorkLate: true, canWorkSaturdays: true, monthlyWorkHourLimit: true, weeklyAvailableDays: true },
  });
  const staffByNumber = new Map(seededStaff.map((member) => [member.employeeNumber, member.id]));
  const staffClassByNumber = new Map(seededStaff.map((member) => [member.employeeNumber, member.assignedClass]));
  const demoRequests = [
    { employeeNumber: 'STAFF-005', requestDate: '2026-07-25', requestType: ShiftRequestType.DAY_OFF, status: ShiftRequestStatus.APPROVED, reason: '家族行事', adminComment: '承認済み' },
    { employeeNumber: 'STAFF-006', requestDate: '2026-07-27', requestType: ShiftRequestType.PAID_LEAVE, status: ShiftRequestStatus.APPROVED, reason: '通院', adminComment: '承認済み' },
    { employeeNumber: 'STAFF-007', requestDate: '2026-07-28', requestType: ShiftRequestType.HALF_DAY_AM, status: ShiftRequestStatus.PENDING, reason: '説明用サンプル（未承認）：午前中に予定あり' },
    { employeeNumber: 'STAFF-009', requestDate: '2026-07-29', requestType: ShiftRequestType.DAY_OFF, status: ShiftRequestStatus.PENDING, reason: '説明用サンプル（未承認）：家庭の予定' },
    { employeeNumber: 'STAFF-013', requestDate: '2026-07-15', requestType: ShiftRequestType.PAID_LEAVE, status: ShiftRequestStatus.APPROVED, reason: '私用', adminComment: '承認済み' },
    { employeeNumber: 'STAFF-014', requestDate: '2026-07-31', requestType: ShiftRequestType.HALF_DAY_PM, status: ShiftRequestStatus.REJECTED, reason: '午後に予定あり', adminComment: '配置調整後に再申請してください' },
    { employeeNumber: 'STAFF-001', requestDate: '2026-08-03', requestType: ShiftRequestType.DAY_OFF, status: ShiftRequestStatus.PENDING, reason: '家庭の予定' },
    { employeeNumber: 'STAFF-001', requestDate: '2026-08-18', requestType: ShiftRequestType.PAID_LEAVE, status: ShiftRequestStatus.APPROVED, reason: '通院', adminComment: '承認済み' },
    { employeeNumber: 'STAFF-002', requestDate: '2026-08-10', requestType: ShiftRequestType.HALF_DAY_PM, status: ShiftRequestStatus.PENDING, reason: '午後に予定あり' },
    { employeeNumber: 'STAFF-003', requestDate: '2026-08-24', requestType: ShiftRequestType.SUMMER_LEAVE, status: ShiftRequestStatus.REJECTED, reason: '夏季休暇', adminComment: '配置人数の都合により要再調整' },
  ];
  await prisma.shiftRequest.deleteMany({ where: { tenantId: tenant.id } });
  for (const request of demoRequests) {
    const staffId = staffByNumber.get(request.employeeNumber);
    if (!staffId) continue;
    const requestDate = new Date(`${request.requestDate}T00:00:00.000Z`);
    await prisma.shiftRequest.upsert({
      where: { tenantId_staffId_requestDate_requestType: { tenantId: tenant.id, staffId, requestDate, requestType: request.requestType } },
      update: { status: request.status, reason: request.reason, adminComment: request.adminComment ?? null },
      create: { tenantId: tenant.id, staffId, requestDate, requestType: request.requestType, status: request.status, reason: request.reason, adminComment: request.adminComment ?? null },
    });
  }

  const targetMonth = new Date('2026-08-01T00:00:00.000Z');
  const monthlyShift = await prisma.monthlyShift.upsert({
    where: { tenantId_targetMonth: { tenantId: tenant.id, targetMonth } },
    update: {},
    create: { tenantId: tenant.id, targetMonth, status: MonthlyShiftStatus.DRAFT, createdByUserId: user.id },
  });
  await prisma.shiftAssignment.deleteMany({ where: { monthlyShiftId: monthlyShift.id } });
  const seedAssignments = [
    { employeeNumber: 'STAFF-001', workDate: '2026-08-03', shiftType: ShiftType.EARLY },
    { employeeNumber: 'STAFF-001', workDate: '2026-08-18', shiftType: ShiftType.NORMAL, note: '承認済み有給との競合確認用' },
    { employeeNumber: 'STAFF-002', workDate: '2026-08-08', shiftType: ShiftType.NORMAL },
    { employeeNumber: 'STAFF-003', workDate: '2026-08-10', shiftType: ShiftType.LATE },
  ];
  for (const assignment of seedAssignments) {
    const staffId = staffByNumber.get(assignment.employeeNumber);
    if (!staffId) continue;
    const defaults = assignment.shiftType === ShiftType.EARLY ? { startTime: '07:00', endTime: '16:00' } : assignment.shiftType === ShiftType.LATE ? { startTime: '11:00', endTime: '19:30' } : { startTime: '08:30', endTime: '17:00' };
    const assignedClass = staffClassByNumber.get(assignment.employeeNumber);
    await prisma.shiftAssignment.upsert({
      where: { monthlyShiftId_staffId_workDate: { monthlyShiftId: monthlyShift.id, staffId, workDate: new Date(`${assignment.workDate}T00:00:00.000Z`) } },
      update: { shiftType: assignment.shiftType, ...defaults, breakMinutes: 60, assignedClass, note: assignment.note ?? null },
      create: { tenantId: tenant.id, monthlyShiftId: monthlyShift.id, staffId, workDate: new Date(`${assignment.workDate}T00:00:00.000Z`), shiftType: assignment.shiftType, ...defaults, breakMinutes: 60, assignedClass, note: assignment.note ?? null },
    });
  }

  const confirmedMonth = new Date('2026-07-01T00:00:00.000Z');
  const confirmedShift = await prisma.monthlyShift.upsert({
    where: { tenantId_targetMonth: { tenantId: tenant.id, targetMonth: confirmedMonth } },
    update: { status: MonthlyShiftStatus.CONFIRMED, confirmedByUserId: user.id, confirmedAt: new Date('2026-06-25T09:00:00.000Z') },
    create: { tenantId: tenant.id, targetMonth: confirmedMonth, status: MonthlyShiftStatus.CONFIRMED, createdByUserId: user.id, confirmedByUserId: user.id, confirmedAt: new Date('2026-06-25T09:00:00.000Z') },
  });
  await prisma.shiftAssignment.deleteMany({ where: { monthlyShiftId: confirmedShift.id } });
  const approvedJulyRequests = new Map(demoRequests
    .filter((request) => request.status === ShiftRequestStatus.APPROVED && request.requestDate.startsWith('2026-07'))
    .map((request) => [`${request.employeeNumber}:${request.requestDate}`, request.requestType]));
  const monthlyMinutes = new Map();
  const weeklyDays = new Map();
  for (let day = 1; day <= 31; day += 1) {
    const workDate = new Date(Date.UTC(2026, 6, day));
    const workDateKey = workDate.toISOString().slice(0, 10);
    const weekday = workDate.getUTCDay();
    for (let index = 0; index < seededStaff.length; index += 1) {
      const member = seededStaff[index];
      let shiftType = ShiftType.OFF;
      const approvedRequest = approvedJulyRequests.get(`${member.employeeNumber}:${workDateKey}`);
      const weekStart = new Date(workDate);
      weekStart.setUTCDate(workDate.getUTCDate() - ((weekday + 6) % 7));
      const weekKey = `${member.id}:${weekStart.toISOString().slice(0, 10)}`;
      const candidate = member.canWorkEarly && index % 8 === day % 8 ? ShiftType.EARLY
        : member.canWorkLate && index % 8 === (day + 1) % 8 ? ShiftType.LATE
        : member.canWorkRegular ? ShiftType.NORMAL : ShiftType.OFF;
      const candidateMinutes = candidate === ShiftType.LATE ? 510 : candidate === ShiftType.OFF ? 0 : 480;
      const withinMonthlyLimit = !member.monthlyWorkHourLimit || (monthlyMinutes.get(member.id) ?? 0) + candidateMinutes <= member.monthlyWorkHourLimit * 60;
      const withinWeeklyLimit = !member.weeklyAvailableDays || (weeklyDays.get(weekKey) ?? 0) < member.weeklyAvailableDays;
      if (approvedRequest === ShiftRequestType.PAID_LEAVE) shiftType = ShiftType.PAID_LEAVE;
      else if (approvedRequest === ShiftRequestType.SUMMER_LEAVE) shiftType = ShiftType.SUMMER_LEAVE;
      else if (approvedRequest === ShiftRequestType.HALF_DAY_AM) shiftType = ShiftType.AM_HALF;
      else if (approvedRequest === ShiftRequestType.HALF_DAY_PM) shiftType = ShiftType.PM_HALF;
      else if (!approvedRequest && weekday !== 0 && (weekday !== 6 || member.canWorkSaturdays && index % 3 === 0) && withinMonthlyLimit && withinWeeklyLimit) {
        shiftType = candidate;
      }
      if ([ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE, ShiftType.OTHER].includes(shiftType)) {
        monthlyMinutes.set(member.id, (monthlyMinutes.get(member.id) ?? 0) + candidateMinutes);
        weeklyDays.set(weekKey, (weeklyDays.get(weekKey) ?? 0) + 1);
      }
      const times = shiftType === ShiftType.EARLY ? { startTime: '07:00', endTime: '16:00' } : shiftType === ShiftType.LATE ? { startTime: '11:00', endTime: '19:30' } : shiftType === ShiftType.NORMAL ? { startTime: '08:30', endTime: '17:00' } : { startTime: null, endTime: null };
      await prisma.shiftAssignment.upsert({
        where: { monthlyShiftId_staffId_workDate: { monthlyShiftId: confirmedShift.id, staffId: member.id, workDate } },
        update: { shiftType, ...times, breakMinutes: times.startTime ? 60 : null, assignedClass: times.startTime ? member.assignedClass : null, note: approvedRequest ? '承認済み休暇' : null },
        create: { tenantId: tenant.id, monthlyShiftId: confirmedShift.id, staffId: member.id, workDate, shiftType, ...times, breakMinutes: times.startTime ? 60 : null, assignedClass: times.startTime ? member.assignedClass : null, note: approvedRequest ? '承認済み休暇' : null },
      });
    }
  }

  const demoNotifications = [
    { memberId: user.id, type: 'SYSTEM', title: 'モニター版へようこそ', message: 'デモデータの準備が完了しました。職員・希望休・確定シフトをご確認ください。', isRead: false },
    { memberId: user.id, type: 'REQUEST_APPROVED', title: '希望休を承認しました', message: '田中 さくらさんの7月25日の希望休を承認しました。', isRead: true },
    { memberId: user.id, type: 'SHIFT_UPDATED', title: '7月シフト確定済み', message: 'プレゼン用の7月シフトを確認できます。', isRead: false },
    { memberId: staffUser.id, type: 'SHIFT_CONFIRMED', title: '7月シフトが確定しました', message: '自分のシフト画面から勤務予定を確認してください。', isRead: false },
  ];
  await prisma.notification.deleteMany({ where: { tenantId: tenant.id } });
  for (const notification of demoNotifications) {
    const existing = await prisma.notification.findFirst({ where: { tenantId: tenant.id, memberId: notification.memberId, title: notification.title } });
    if (existing) await prisma.notification.update({ where: { id: existing.id }, data: notification });
    else await prisma.notification.create({ data: { tenantId: tenant.id, ...notification } });
  }

  const swapDate = new Date('2026-07-28T00:00:00.000Z');
  const existingSwap = await prisma.shiftSwapRequest.findFirst({ where: { tenantId: tenant.id, requesterId: staffUser.id, targetMemberId: user.id, requestDate: swapDate } });
  const swapData = { status: 'PENDING', requestComment: '家庭の都合により勤務交換をお願いします。', adminComment: null };
  if (existingSwap) await prisma.shiftSwapRequest.update({ where: { id: existingSwap.id }, data: swapData });
  else await prisma.shiftSwapRequest.create({ data: { tenantId: tenant.id, requesterId: staffUser.id, targetMemberId: user.id, requestDate: swapDate, ...swapData } });
}

main().finally(() => prisma.$disconnect());
