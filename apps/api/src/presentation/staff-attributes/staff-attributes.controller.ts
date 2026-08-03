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
import { StaffAttributeAssignmentInputDto, StaffAttributeDefinitionCreateDto, StaffAttributeDefinitionUpdateDto } from './staff-attribute.dto';
import { StaffAttributesService } from './staff-attributes.service';

@Controller('staff-attributes') @UseGuards(JwtAuthGuard,TenantAccessGuard,RolesGuard,SubscriptionWriteGuard,FeatureGuard) @Roles('ADMIN','DIRECTOR')
export class StaffAttributeDefinitionsController {constructor(private readonly service:StaffAttributesService){}
  @Get() list(@Req()r:Request&{user:AuthenticatedUser}){return this.service.listDefinitions(r.user);}
  @Post() @Roles('ADMIN') @RequiresFeature('ROLE_QUALIFICATION_MANAGEMENT') create(@Req()r:Request&{user:AuthenticatedUser},@Body()input:StaffAttributeDefinitionCreateDto){return this.service.createDefinition(r.user,input);}
  @Put(':attributeId') @Roles('ADMIN') @RequiresFeature('ROLE_QUALIFICATION_MANAGEMENT') update(@Req()r:Request&{user:AuthenticatedUser},@Param('attributeId',new ParseUUIDPipe())id:string,@Body()input:StaffAttributeDefinitionUpdateDto){return this.service.updateDefinition(r.user,id,input);}
  @Delete(':attributeId') @Roles('ADMIN') @RequiresFeature('ROLE_QUALIFICATION_MANAGEMENT') remove(@Req()r:Request&{user:AuthenticatedUser},@Param('attributeId',new ParseUUIDPipe())id:string){return this.service.deactivateDefinition(r.user,id);}
}

@Controller('staff/:staffId/attributes') @UseGuards(JwtAuthGuard,TenantAccessGuard,RolesGuard,SubscriptionWriteGuard,FeatureGuard) @Roles('ADMIN','DIRECTOR')
export class StaffAttributeAssignmentsController {constructor(private readonly service:StaffAttributesService){}
  @Get() list(@Req()r:Request&{user:AuthenticatedUser},@Param('staffId',new ParseUUIDPipe())staffId:string){return this.service.listAssignments(r.user,staffId);}
  @Post() @Roles('ADMIN') @RequiresFeature('ROLE_QUALIFICATION_MANAGEMENT') create(@Req()r:Request&{user:AuthenticatedUser},@Param('staffId',new ParseUUIDPipe())staffId:string,@Body()input:StaffAttributeAssignmentInputDto){return this.service.createAssignment(r.user,staffId,input);}
  @Put(':assignmentId') @Roles('ADMIN') @RequiresFeature('ROLE_QUALIFICATION_MANAGEMENT') update(@Req()r:Request&{user:AuthenticatedUser},@Param('staffId',new ParseUUIDPipe())staffId:string,@Param('assignmentId',new ParseUUIDPipe())id:string,@Body()input:StaffAttributeAssignmentInputDto){return this.service.updateAssignment(r.user,staffId,id,input);}
  @Delete(':assignmentId') @Roles('ADMIN') @RequiresFeature('ROLE_QUALIFICATION_MANAGEMENT') remove(@Req()r:Request&{user:AuthenticatedUser},@Param('staffId',new ParseUUIDPipe())staffId:string,@Param('assignmentId',new ParseUUIDPipe())id:string){return this.service.deactivateAssignment(r.user,staffId,id);}
}
