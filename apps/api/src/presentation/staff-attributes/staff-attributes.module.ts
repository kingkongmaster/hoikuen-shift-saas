import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FeaturesModule } from '../features/features.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StaffAttributeAssignmentsController, StaffAttributeDefinitionsController } from './staff-attributes.controller';
import { StaffAttributesService } from './staff-attributes.service';

@Module({imports:[AuditModule,FeaturesModule,SubscriptionsModule],controllers:[StaffAttributeDefinitionsController,StaffAttributeAssignmentsController],providers:[StaffAttributesService]})
export class StaffAttributesModule{}
