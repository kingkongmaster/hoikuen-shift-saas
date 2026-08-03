import { AssignedClass, StaffingConstraintLevel } from '@prisma/client';
import type { GeneratedAssignment, GenerationWarning } from './rule-based-shift-generator';

export type GeneratorStaffingRequirement = { id: string; code: string; name: string; attributeDefinitionId: string; classType: AssignedClass | null; dayOfWeek: number | null; startDate: Date | null; endDate: Date | null; requiredCount: number; constraintLevel: StaffingConstraintLevel };
export type GeneratorAttributeAssignment = { staffId: string; attributeDefinitionId: string; startDate: Date | null; endDate: Date | null };
export type StaffingRequirementEvaluation = { requirementId: string; code: string; name: string; date: string; classType: AssignedClass | null; constraintLevel: StaffingConstraintLevel; requiredCount: number; actualCount: number; isSatisfied: boolean; matchedStaffIds: string[]; message: string; level: 'INFO' | 'WARNING' | 'ERROR' };

export function activeRequirements(requirements: GeneratorStaffingRequirement[], date: Date) { return requirements.filter((item) => (!item.startDate || item.startDate <= date) && (!item.endDate || item.endDate >= date) && (item.dayOfWeek == null || item.dayOfWeek === date.getUTCDay())); }
export function hasAttribute(assignments: GeneratorAttributeAssignment[], staffId: string, attributeDefinitionId: string, date: Date) { return assignments.some((item) => item.staffId === staffId && item.attributeDefinitionId === attributeDefinitionId && (!item.startDate || item.startDate <= date) && (!item.endDate || item.endDate >= date)); }

export function staffingPriority(requirements: GeneratorStaffingRequirement[], attributes: GeneratorAttributeAssignment[], date: Date, staffId: string, classType: AssignedClass | null, assigned: GeneratedAssignment[]) {
  const scores = { hard: 0, soft: 0 };
  for (const requirement of activeRequirements(requirements, date)) {
    if (requirement.constraintLevel === StaffingConstraintLevel.INFO || requirement.classType !== classType) continue;
    const matched = new Set(assigned.filter((item) => (!classType || item.assignedClass === classType) && hasAttribute(attributes, item.staffId, requirement.attributeDefinitionId, date)).map((item) => item.staffId));
    if (matched.size >= requirement.requiredCount || matched.has(staffId) || !hasAttribute(attributes, staffId, requirement.attributeDefinitionId, date)) continue;
    if (requirement.constraintLevel === StaffingConstraintLevel.HARD) scores.hard += 1;
    if (requirement.constraintLevel === StaffingConstraintLevel.SOFT) scores.soft += 1;
  }
  return scores;
}

export function evaluateStaffingRequirements(requirements: GeneratorStaffingRequirement[], attributes: GeneratorAttributeAssignment[], assignments: GeneratedAssignment[]) {
  const evaluations: StaffingRequirementEvaluation[] = [];
  const dates = [...new Set(assignments.map((item) => item.workDate.toISOString().slice(0, 10)))].sort();
  for (const dateKey of dates) {
    const date = new Date(`${dateKey}T00:00:00.000Z`); const day = assignments.filter((item) => item.workDate.toISOString().slice(0, 10) === dateKey);
    for (const requirement of activeRequirements(requirements, date)) {
      const matchedStaffIds = [...new Set(day.filter((item) => (!requirement.classType || item.assignedClass === requirement.classType) && hasAttribute(attributes, item.staffId, requirement.attributeDefinitionId, date)).map((item) => item.staffId))].sort();
      const actualCount = matchedStaffIds.length; const isSatisfied = actualCount >= requirement.requiredCount;
      const level = requirement.constraintLevel === StaffingConstraintLevel.HARD && !isSatisfied ? 'ERROR' : requirement.constraintLevel === StaffingConstraintLevel.SOFT && !isSatisfied ? 'WARNING' : 'INFO';
      const target = requirement.classType ? `${requirement.classType.replace('AGE_', '')}歳児クラス` : '園全体';
      evaluations.push({ requirementId: requirement.id, code: requirement.code, name: requirement.name, date: dateKey, classType: requirement.classType, constraintLevel: requirement.constraintLevel, requiredCount: requirement.requiredCount, actualCount, isSatisfied, matchedStaffIds, level, message: `${target}で${requirement.name}が${requirement.requiredCount}名必要ですが、${actualCount}名配置されています。` });
    }
  }
  return evaluations;
}

export function evaluationWarnings(evaluations: StaffingRequirementEvaluation[]): GenerationWarning[] { return evaluations.filter((item) => item.constraintLevel === StaffingConstraintLevel.INFO || !item.isSatisfied).map((item) => ({ code: `STAFFING_REQUIREMENT_${item.constraintLevel}`, level: item.level, workDate: item.date, ...(item.classType ? { classType: item.classType } : {}), required: item.requiredCount, assigned: item.actualCount, message: item.message })); }
