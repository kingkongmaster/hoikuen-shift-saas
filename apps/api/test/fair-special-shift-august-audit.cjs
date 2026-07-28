const { MembershipRole, PrismaClient, ShiftRequestStatus } = require('@prisma/client');
const { generateRuleBasedSchedule } = require('../dist/application/shifts/rule-based-shift-generator');

const prisma = new PrismaClient();
const tenantId = '00000000-0000-4000-8000-000000000001';
const start = new Date('2026-08-01T00:00:00.000Z');
const end = new Date('2026-09-01T00:00:00.000Z');
const before = {
  'STAFF-001': [14, 0], 'STAFF-003': [0, 14], 'STAFF-004': [2, 1], 'STAFF-005': [0, 0],
  'STAFF-006': [7, 5], 'STAFF-007': [2, 2], 'STAFF-008': [3, 3], 'STAFF-009': [3, 4],
  'STAFF-010': [2, 6], 'STAFF-011': [5, 1], 'STAFF-012': [2, 4], 'STAFF-013': [1, 2], 'STAFF-014': [2, 1],
};

async function main() {
  const [staff, requests, setting, requirements, closedDates, managers] = await Promise.all([
    prisma.staff.findMany({ where: { tenantId, isActive: true }, orderBy: { employeeNumber: 'asc' } }),
    prisma.shiftRequest.findMany({ where: { tenantId, status: ShiftRequestStatus.APPROVED, requestDate: { gte: start, lt: end } }, select: { staffId: true, requestDate: true, requestType: true, reason: true } }),
    prisma.tenantShiftSetting.findUniqueOrThrow({ where: { tenantId } }),
    prisma.classStaffingRequirement.findMany({ where: { tenantId } }),
    prisma.tenantClosedDate.findMany({ where: { tenantId, closedDate: { gte: start, lt: end } }, select: { closedDate: true, name: true } }),
    prisma.membership.findMany({ where: { tenantId, role: { in: [MembershipRole.ADMIN, MembershipRole.DIRECTOR] }, isActive: true }, select: { userId: true } }),
  ]);
  const managerIds = new Set(managers.map((row) => row.userId));
  const generationStaff = staff.filter((row) => !row.userId || !managerIds.has(row.userId));
  const result = generateRuleBasedSchedule(start, generationStaff.map((row) => ({ ...row, isDirector: false })), requests, { ...setting, directorClassPlacementMode: setting.directorClassPlacementMode, requirements, classRequirements: requirements, closedDates });
  const staffById = new Map(generationStaff.map((row) => [row.id, row]));
  const working = new Set(['EARLY', 'NORMAL', 'LATE']);
  const approvedRequestKeys = new Set(requests.map((row) => `${row.staffId}:${row.requestDate.toISOString().slice(0, 10)}`));
  const violations = [];
  const actualMinutesByStaff = new Map();
  for (const assignment of result.assignments) {
    const member = staffById.get(assignment.staffId); const day = assignment.workDate.getUTCDay();
    if (assignment.shiftType === 'EARLY' && !member.canWorkEarly) violations.push(`EARLY:${member.employeeNumber}:${assignment.workDate.toISOString()}`);
    if (assignment.shiftType === 'LATE' && !member.canWorkLate) violations.push(`LATE:${member.employeeNumber}:${assignment.workDate.toISOString()}`);
    if (assignment.shiftType === 'NORMAL' && !member.canWorkRegular) violations.push(`NORMAL:${member.employeeNumber}:${assignment.workDate.toISOString()}`);
    if (day === 6 && working.has(assignment.shiftType) && !member.canWorkSaturdays) violations.push(`SATURDAY:${member.employeeNumber}:${assignment.workDate.toISOString()}`);
    if (working.has(assignment.shiftType) && approvedRequestKeys.has(`${assignment.staffId}:${assignment.workDate.toISOString().slice(0, 10)}`)) violations.push(`APPROVED_REQUEST:${member.employeeNumber}:${assignment.workDate.toISOString()}`);
  }
  for (const member of generationStaff) {
    const list = result.assignments.filter((row) => row.staffId === member.id).sort((a, b) => a.workDate - b.workDate);
    let minutes = 0; let workStreak = 0; let earlyStreak = 0; let lateStreak = 0; const weekDays = new Map();
    for (const row of list) {
      const isWork = working.has(row.shiftType); workStreak = isWork ? workStreak + 1 : 0; earlyStreak = row.shiftType === 'EARLY' ? earlyStreak + 1 : 0; lateStreak = row.shiftType === 'LATE' ? lateStreak + 1 : 0;
      if (workStreak > setting.maxConsecutiveWorkDays || earlyStreak > setting.maxConsecutiveEarlyDays || lateStreak > setting.maxConsecutiveLateDays) violations.push(`STREAK:${member.employeeNumber}:${row.workDate.toISOString()}`);
      if (!isWork) continue;
      const [sh, sm] = row.startTime.split(':').map(Number); const [eh, em] = row.endTime.split(':').map(Number); minutes += eh * 60 + em - sh * 60 - sm - (row.breakMinutes || 0);
      const monday = new Date(row.workDate); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); const week = monday.toISOString().slice(0, 10); weekDays.set(week, (weekDays.get(week) || 0) + 1);
    }
    if (member.monthlyWorkHourLimit && minutes > member.monthlyWorkHourLimit * 60) violations.push(`MONTHLY_LIMIT:${member.employeeNumber}`);
    if (member.weeklyAvailableDays && [...weekDays.values()].some((count) => count > member.weeklyAvailableDays)) violations.push(`WEEKLY_LIMIT:${member.employeeNumber}`);
    actualMinutesByStaff.set(member.id, minutes);
  }
  const fixedDuplicates = new Map();
  for (const row of result.assignments.filter((item) => item.shiftType === 'EARLY' || item.shiftType === 'LATE')) {
    const assignedClass = staffById.get(row.staffId).assignedClass;
    if (!assignedClass.startsWith('AGE_')) continue;
    const key = `${row.workDate.toISOString().slice(0, 10)}:${row.shiftType}:${assignedClass}`;
    fixedDuplicates.set(key, (fixedDuplicates.get(key) || 0) + 1);
  }
  if ([...fixedDuplicates.values()].some((count) => count > 1)) violations.push('FIXED_CLASS_DUPLICATE');
  const table = result.specialShiftSummary.map((row) => {
    const previous = before[row.employeeNumber] || [0, 0];
    const member = staffById.get(row.staffId); const actualHours = Number(((actualMinutesByStaff.get(row.staffId) || 0) / 60).toFixed(2)); const targetDays = member.monthlyTargetWorkDays; const targetHours = member.monthlyTargetWorkHours;
    const dayDifference = targetDays == null ? null : row.workCount - targetDays; const hourDifference = targetHours == null ? null : Number((actualHours - targetHours).toFixed(2)); const status = [dayDifference < 0 || hourDifference < 0 ? '目標未達' : null, dayDifference > 0 || hourDifference > 0 ? '目標超過' : null, member.monthlyWorkHourLimit && actualHours > member.monthlyWorkHourLimit ? '上限超過' : null].filter(Boolean).join('・') || '目標達成';
    return { employeeNumber: row.employeeNumber, name: row.displayName, employmentType: member.employmentType, targetDays, workDays: row.workCount, dayDifference, targetHours, actualHours, hourDifference, limitHours: member.monthlyWorkHourLimit, early: row.earlyCount, late: row.lateCount, saturday: row.saturdayCount, status, earlyGroup: row.earlyCategory, lateGroup: row.lateCategory, earlyDelta: row.earlyCount - previous[0], lateDelta: row.lateCount - previous[1] };
  });
  const spread = (field, category) => { const values = table.filter((row) => row[category] === 'GENERAL').map((row) => row[field]); return { max: Math.max(...values), min: Math.min(...values), difference: Math.max(...values) - Math.min(...values) }; };
  console.table(table);
  const targetCounts = { daysMet: table.filter((row) => row.dayDifference === 0).length, daysShort: table.filter((row) => row.dayDifference < 0).length, daysExcess: table.filter((row) => row.dayDifference > 0).length, hoursMet: table.filter((row) => row.hourDifference === 0).length, hoursShort: table.filter((row) => row.hourDifference < 0).length, hoursExcess: table.filter((row) => row.hourDifference > 0).length, limitExcess: table.filter((row) => row.limitHours && row.actualHours > row.limitHours).length };
  console.log(JSON.stringify({ generatedStaff: generationStaff.length, totalAssignments: result.assignments.length, targetCounts, generalEarlySpread: spread('early', 'earlyGroup'), generalLateSpread: spread('late', 'lateGroup'), dedicated: table.filter((row) => row.earlyGroup === 'DEDICATED' || row.lateGroup === 'DEDICATED'), placementShortageWarnings: result.warnings.filter((row) => row.code === 'CLASS_SHORTAGE').length, warningCounts: result.warnings.reduce((acc, row) => ({ ...acc, [row.code]: (acc[row.code] || 0) + 1 }), {}), conditionViolations: violations.length }, null, 2));
  if (generationStaff.length !== 14 || result.assignments.length !== 434 || violations.length) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
