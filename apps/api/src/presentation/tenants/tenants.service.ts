import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';

@Injectable()
export class TenantsService {
  // Legacy creation granted the operator an implicit customer ADMIN membership.
  // Use the atomic provisioning flow with an independent customer administrator.
  async create(_user: AuthenticatedUser, _input: { name: string; code: string; adminDisplayName?: string; timezone?: string }) {
    throw new ForbiddenException({ code: 'INDEPENDENT_ADMIN_REQUIRED', message: '園の管理者を指定する新規園導入を利用してください。' });
  }
}
