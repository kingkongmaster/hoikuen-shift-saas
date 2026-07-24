import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '../../domain/identity/membership-role';

export const ROLES_KEY = 'enshift.roles';
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);

