export const employmentTypes = ['FULL_TIME', 'PART_TIME', 'REEMPLOYED'] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export const assignedClasses = ['AGE_0', 'AGE_1', 'AGE_2', 'AGE_3', 'AGE_4', 'AGE_5', 'FREE', 'SUPPORT'] as const;
export type AssignedClass = (typeof assignedClasses)[number];
