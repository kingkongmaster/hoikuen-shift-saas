import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Matches } from 'class-validator';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { SubscriptionWriteGuard } from '../subscriptions/subscription-write.guard';
import { RuleExceptionInputDto, TenantEventInputDto } from './tenant-calendar.dto';
import { TenantCalendarService } from './tenant-calendar.service';
class MonthQuery{@Matches(/^\d{4}-(0[1-9]|1[0-2])$/)month!:string}
@Controller('tenant-calendar') @UseGuards(JwtAuthGuard,TenantAccessGuard,RolesGuard,SubscriptionWriteGuard) @Roles('ADMIN','DIRECTOR')
export class TenantCalendarController{constructor(private readonly service:TenantCalendarService){}
  @Get('events') @Roles('ADMIN','DIRECTOR','CHIEF','STAFF') events(@Req()req:Request&{user:AuthenticatedUser},@Query()query:MonthQuery){return this.service.events(req.user,query.month)}
  @Post('events') createEvent(@Req()req:Request&{user:AuthenticatedUser},@Body()input:TenantEventInputDto){return this.service.createEvent(req.user,input)}
  @Delete('events/:id') removeEvent(@Req()req:Request&{user:AuthenticatedUser},@Param('id',new ParseUUIDPipe())id:string){return this.service.removeEvent(req.user,id)}
  @Get('rule-exceptions') exceptions(@Req()req:Request&{user:AuthenticatedUser},@Query()query:MonthQuery){return this.service.exceptions(req.user,query.month)}
  @Post('rule-exceptions') createException(@Req()req:Request&{user:AuthenticatedUser},@Body()input:RuleExceptionInputDto){return this.service.createException(req.user,input)}
  @Delete('rule-exceptions/:id') removeException(@Req()req:Request&{user:AuthenticatedUser},@Param('id',new ParseUUIDPipe())id:string){return this.service.removeException(req.user,id)}
}
