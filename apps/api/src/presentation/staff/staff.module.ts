import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StaffLoginAccountService } from './staff-login-account.service';

@Module({ imports: [AuthModule, AuditModule, SubscriptionsModule], controllers: [StaffController], providers: [StaffService, StaffLoginAccountService] })
export class StaffModule {}
