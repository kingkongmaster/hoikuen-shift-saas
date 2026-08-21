import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { PaidLeaveCorrectionDto, PaidLeaveGrantInputDto, PaidLeaveReasonDto, PaidLeaveUsageInputDto } from './paid-leave.dto';
import { PaidLeaveService } from './paid-leave.service';

@Controller('staff/:staffId/paid-leave')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR')
export class PaidLeaveController {
  constructor(private readonly paidLeave: PaidLeaveService) {}

  @Get('grants')
  grants(@Req() req: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string) { return this.paidLeave.grants(req.user, staffId); }

  @Post('grants')
  createGrant(@Req() req: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string, @Body() input: PaidLeaveGrantInputDto) { return this.paidLeave.createGrant(req.user, staffId, input); }

  @Post('grants/:grantId/void')
  voidGrant(@Req() req: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string, @Param('grantId', new ParseUUIDPipe()) grantId: string, @Body() input: PaidLeaveReasonDto) { return this.paidLeave.voidGrant(req.user, staffId, grantId, input.reason); }

  @Get('usages')
  usages(@Req() req: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string) { return this.paidLeave.usages(req.user, staffId); }

  @Post('usages/confirm')
  confirm(@Req() req: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string, @Body() input: PaidLeaveUsageInputDto) { return this.paidLeave.confirm(req.user, staffId, input); }

  @Post('usages/:usageId/cancel')
  cancel(@Req() req: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string, @Param('usageId', new ParseUUIDPipe()) usageId: string, @Body() input: PaidLeaveReasonDto) { return this.paidLeave.cancel(req.user, staffId, usageId, input.reason); }

  @Post('usages/:usageId/correct')
  correct(@Req() req: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string, @Param('usageId', new ParseUUIDPipe()) usageId: string, @Body() input: PaidLeaveCorrectionDto) { return this.paidLeave.correct(req.user, staffId, usageId, input); }

  @Get('balance')
  balance(@Req() req: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string, @Query('asOf') asOf?: string) { return this.paidLeave.balance(req.user, staffId, asOf); }
}

