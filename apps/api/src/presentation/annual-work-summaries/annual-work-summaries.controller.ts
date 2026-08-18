import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { AnnualWorkSummaryQueryDto } from './annual-work-summary-query.dto';
import { AnnualWorkSummariesService } from './annual-work-summaries.service';

@Controller('annual-work-summaries')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR')
export class AnnualWorkSummariesController {
  constructor(private readonly summaries: AnnualWorkSummariesService) {}

  @Get()
  list(@Req() request: Request & { user: AuthenticatedUser }, @Query() query: AnnualWorkSummaryQueryDto) {
    return this.summaries.list(request.user, query.fiscalYear);
  }
}
