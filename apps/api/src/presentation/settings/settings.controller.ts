import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { SubscriptionWriteGuard } from '../subscriptions/subscription-write.guard';
import { UpdateClassRequirementsDto, UpdateShiftSettingDto } from './settings.dto';
import { SettingsService } from './settings.service';
@Controller('settings') @UseGuards(JwtAuthGuard,TenantAccessGuard,RolesGuard,SubscriptionWriteGuard) @Roles('ADMIN','DIRECTOR')
export class SettingsController { constructor(private readonly settings:SettingsService){} @Get('shifts') get(@Req()req:Request&{user:AuthenticatedUser}){return this.settings.setting(req.user)} @Patch('shifts') update(@Req()req:Request&{user:AuthenticatedUser},@Body()input:UpdateShiftSettingDto){return this.settings.updateSetting(req.user,input)} @Get('class-requirements') classes(@Req()req:Request&{user:AuthenticatedUser}){return this.settings.requirements(req.user)} @Patch('class-requirements') updateClasses(@Req()req:Request&{user:AuthenticatedUser},@Body()input:UpdateClassRequirementsDto){return this.settings.updateRequirements(req.user,input)} }
