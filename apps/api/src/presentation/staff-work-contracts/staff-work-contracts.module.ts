import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StaffWorkContractsController } from './staff-work-contracts.controller';
import { StaffWorkContractsService } from './staff-work-contracts.service';

@Module({ imports: [AuditModule, SubscriptionsModule], controllers: [StaffWorkContractsController], providers: [StaffWorkContractsService] })
export class StaffWorkContractsModule {}
