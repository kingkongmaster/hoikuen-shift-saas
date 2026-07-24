import type { MembershipRole } from '../identity/membership-role';

export const shiftRequestTypes = ['DAY_OFF', 'PAID_LEAVE', 'SUMMER_LEAVE', 'BEREAVEMENT', 'HALF_DAY_AM', 'HALF_DAY_PM', 'OTHER'] as const;
export type ShiftRequestType = (typeof shiftRequestTypes)[number];

export const shiftRequestStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ShiftRequestStatus = (typeof shiftRequestStatuses)[number];

export const requestReviewerRoles: MembershipRole[] = ['ADMIN', 'DIRECTOR'];
