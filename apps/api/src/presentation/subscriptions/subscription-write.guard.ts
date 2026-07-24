import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { SubscriptionsService } from './subscriptions.service';
@Injectable() export class SubscriptionWriteGuard implements CanActivate { constructor(private readonly subscriptions:SubscriptionsService){} async canActivate(context:ExecutionContext){const request=context.switchToHttp().getRequest<Request&{user:AuthenticatedUser}>();if(['GET','HEAD','OPTIONS'].includes(request.method)||request.path.endsWith('/precheck'))return true;await this.subscriptions.assertWritable(request.user.tenantId);return true;} }
