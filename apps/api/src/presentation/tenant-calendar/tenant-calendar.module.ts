import {Module} from '@nestjs/common';import {SubscriptionsModule} from '../subscriptions/subscriptions.module';import {TenantCalendarController}from'./tenant-calendar.controller';import{TenantCalendarService}from'./tenant-calendar.service';
@Module({imports:[SubscriptionsModule],controllers:[TenantCalendarController],providers:[TenantCalendarService]})export class TenantCalendarModule{}
