import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { FeaturesModule } from '../features/features.module';
import { WorkPatternsModule } from '../work-patterns/work-patterns.module';
import { MonthlyGenerationContextBuilder } from '../../application/shifts/monthly-generation-context-builder';

@Module({ imports: [SettingsModule, NotificationsModule, AuditModule, SubscriptionsModule, FeaturesModule, WorkPatternsModule], controllers: [ShiftsController], providers: [ShiftsService, MonthlyGenerationContextBuilder] })
export class ShiftsModule {}
