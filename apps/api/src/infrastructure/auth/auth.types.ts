import type { MembershipRole } from '../../domain/identity/membership-role';

export type AuthenticatedUser = {
  sub: string;
  tenantId: string;
  role: MembershipRole;
  email: string;
};

