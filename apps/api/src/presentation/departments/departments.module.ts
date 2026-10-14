import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DepartmentsController, StaffDepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
@Module({ imports: [AuthModule, SubscriptionsModule], controllers: [DepartmentsController, StaffDepartmentsController], providers: [DepartmentsService] })
export class DepartmentsModule {}
