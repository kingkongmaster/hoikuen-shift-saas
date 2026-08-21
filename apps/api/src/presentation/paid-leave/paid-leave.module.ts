import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaidLeaveController } from './paid-leave.controller';
import { PaidLeaveService } from './paid-leave.service';

@Module({ imports: [SubscriptionsModule], controllers: [PaidLeaveController], providers: [PaidLeaveService] })
export class PaidLeaveModule {}
