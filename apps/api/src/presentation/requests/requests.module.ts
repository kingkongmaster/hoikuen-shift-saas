import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({ imports: [AuthModule, NotificationsModule, AuditModule, SubscriptionsModule], controllers: [RequestsController], providers: [RequestsService] })
export class RequestsModule {}
