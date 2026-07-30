import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FeaturesModule } from '../features/features.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StaffWorkRulesController } from './staff-work-rules.controller';
import { StaffWorkRulesService } from './staff-work-rules.service';
@Module({imports:[AuthModule,AuditModule,FeaturesModule,SubscriptionsModule],controllers:[StaffWorkRulesController],providers:[StaffWorkRulesService]}) export class StaffWorkRulesModule{}
