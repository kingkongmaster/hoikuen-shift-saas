import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FeaturesModule } from '../features/features.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WorkPatternsController } from './work-patterns.controller';
import { WorkPatternsService } from './work-patterns.service';
@Module({ imports: [AuditModule, FeaturesModule, SubscriptionsModule], controllers: [WorkPatternsController], providers: [WorkPatternsService], exports: [WorkPatternsService] })
export class WorkPatternsModule {}
