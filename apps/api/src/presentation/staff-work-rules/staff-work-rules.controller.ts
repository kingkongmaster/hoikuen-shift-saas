import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { FeatureGuard } from '../features/feature.guard';
import { RequiresFeature } from '../features/requires-feature.decorator';
import { SubscriptionWriteGuard } from '../subscriptions/subscription-write.guard';
import { StaffWorkRuleInputDto } from './staff-work-rule.dto';
import { StaffWorkRulesService } from './staff-work-rules.service';

@Controller('staff/:staffId/work-rules') @UseGuards(JwtAuthGuard,TenantAccessGuard,RolesGuard,SubscriptionWriteGuard,FeatureGuard) @Roles('ADMIN','DIRECTOR')
export class StaffWorkRulesController { constructor(private readonly rules:StaffWorkRulesService){}
  @Get() list(@Req()r:Request&{user:AuthenticatedUser},@Param('staffId',new ParseUUIDPipe())staffId:string){return this.rules.list(r.user,staffId);}
  @Post() @Roles('ADMIN') @RequiresFeature('STAFF_WORK_RULES') create(@Req()r:Request&{user:AuthenticatedUser},@Param('staffId',new ParseUUIDPipe())staffId:string,@Body()input:StaffWorkRuleInputDto){return this.rules.create(r.user,staffId,input);}
  @Put(':ruleId') @Roles('ADMIN') @RequiresFeature('STAFF_WORK_RULES') update(@Req()r:Request&{user:AuthenticatedUser},@Param('staffId',new ParseUUIDPipe())staffId:string,@Param('ruleId',new ParseUUIDPipe())ruleId:string,@Body()input:StaffWorkRuleInputDto){return this.rules.update(r.user,staffId,ruleId,input);}
  @Delete(':ruleId') @Roles('ADMIN') @RequiresFeature('STAFF_WORK_RULES') deactivate(@Req()r:Request&{user:AuthenticatedUser},@Param('staffId',new ParseUUIDPipe())staffId:string,@Param('ruleId',new ParseUUIDPipe())ruleId:string){return this.rules.deactivate(r.user,staffId,ruleId);}
}
