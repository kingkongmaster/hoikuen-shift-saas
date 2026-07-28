export const employmentTypes = ['FULL_TIME', 'PART_TIME', 'REEMPLOYED'] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export const assignedClasses = ['AGE_0', 'AGE_1', 'AGE_2', 'AGE_3', 'AGE_4', 'AGE_5', 'FREE', 'SUPPORT'] as const;
export type AssignedClass = (typeof assignedClasses)[number];

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function individualRegularWorkHoursError(start: string | null | undefined, end: string | null | undefined): string | null {
  const hasStart = start !== null && start !== undefined && start !== '';
  const hasEnd = end !== null && end !== undefined && end !== '';
  if (hasStart !== hasEnd) return '個別通常勤務時間は開始時刻と終了時刻を両方指定してください。';
  if (!hasStart) return null;
  if (!timePattern.test(start!) || !timePattern.test(end!)) return '個別通常勤務時間はHH:mm形式で指定してください。';
  if (start! >= end!) return '個別通常勤務の終了時刻は開始時刻より後に指定してください。';
  return null;
}
