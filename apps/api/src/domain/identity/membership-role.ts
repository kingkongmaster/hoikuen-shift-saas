export const membershipRoles = ['ADMIN', 'DIRECTOR', 'CHIEF', 'STAFF'] as const;
export type MembershipRole = (typeof membershipRoles)[number];
export const managerRoles: MembershipRole[] = ['ADMIN', 'DIRECTOR', 'CHIEF'];

