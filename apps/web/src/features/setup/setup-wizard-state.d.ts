import type { Role, SetupState } from '../../api/client';

export const SETUP_STEP_COUNT: 5;
export function canUseSetupWizard(role: Role): boolean;
export function isSetupComplete(setup: SetupState | null | undefined): boolean;
export function resumeSetupStep(setup: SetupState | null | undefined): number;
export function moveSetupStep(step: number, direction: number): number;
export function setupLayoutForWidth(width: number): 'mobile' | 'desktop';
export function validateSetupStep(step: number, draft: {
  tenant: { name: string; contactEmail: string };
  workSettings: Record<string, string | number | boolean>;
  classRequirements: Array<{ weekdayRequired: number }>;
  accepted: boolean;
}): string[];
