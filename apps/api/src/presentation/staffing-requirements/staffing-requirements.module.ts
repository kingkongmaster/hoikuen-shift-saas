import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FeaturesModule } from '../features/features.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StaffingRequirementsController } from './staffing-requirements.controller';
import { StaffingRequirementsService } from './staffing-requirements.service';

@Module({ imports: [AuditModule, FeaturesModule, SubscriptionsModule], controllers: [StaffingRequirementsController], providers: [StaffingRequirementsService] })
export class StaffingRequirementsModule {}
