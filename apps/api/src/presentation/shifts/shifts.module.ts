import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({ imports: [SettingsModule, NotificationsModule, AuditModule, SubscriptionsModule], controllers: [ShiftsController], providers: [ShiftsService] })
export class ShiftsModule {}
