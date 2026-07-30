import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { FeatureCode } from '../../domain/features/feature-catalog';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { REQUIRED_FEATURE_KEY } from './requires-feature.decorator';
import { FeaturesService } from './features.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly features: FeaturesService) {}
  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<FeatureCode>(REQUIRED_FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    await this.features.assertAvailable(request.user.tenantId, required);
    return true;
  }
}
