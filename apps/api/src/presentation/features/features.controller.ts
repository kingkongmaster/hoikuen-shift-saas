import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { FEATURE_CODES, type FeatureCode } from '../../domain/features/feature-catalog';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { UpdateTenantFeatureDto } from './feature.dto';
import { FeaturesService } from './features.service';

@Controller('features')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class FeaturesController {
  constructor(private readonly features: FeaturesService) {}
  @Get() list(@Req() request: Request & { user: AuthenticatedUser }) { return this.features.list(request.user.tenantId); }
}

@Controller('platform/tenants/:tenantId/features')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class PlatformFeaturesController {
  constructor(private readonly features: FeaturesService) {}
  @Get() list(@Req() request: Request & { user: AuthenticatedUser }, @Param('tenantId', new ParseUUIDPipe()) tenantId: string) { return this.features.platformList(request.user, tenantId); }
  @Put() set(@Req() request: Request & { user: AuthenticatedUser }, @Param('tenantId', new ParseUUIDPipe()) tenantId: string, @Body() input: UpdateTenantFeatureDto) { return this.features.platformSet(request.user, tenantId, input); }
  @Delete(':featureCode') remove(@Req() request: Request & { user: AuthenticatedUser }, @Param('tenantId', new ParseUUIDPipe()) tenantId: string, @Param('featureCode') featureCode: string) {
    if (!(FEATURE_CODES as readonly string[]).includes(featureCode)) throw new BadRequestException('未定義のFeature Codeです。');
    return this.features.platformDelete(request.user, tenantId, featureCode as FeatureCode);
  }
}
