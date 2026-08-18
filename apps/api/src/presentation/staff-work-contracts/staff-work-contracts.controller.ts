import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { StaffWorkContractInputDto } from './staff-work-contract.dto';
import { StaffWorkContractsService } from './staff-work-contracts.service';

@Controller('staff/:staffId/work-contracts')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR')
export class StaffWorkContractsController {
  constructor(private readonly contracts: StaffWorkContractsService) {}

  @Get()
  list(@Req() request: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string) {
    return this.contracts.list(request.user, staffId);
  }

  @Post()
  create(@Req() request: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string, @Body() input: StaffWorkContractInputDto) {
    return this.contracts.create(request.user, staffId, input);
  }

  @Put(':contractId')
  update(@Req() request: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string, @Param('contractId', new ParseUUIDPipe()) contractId: string, @Body() input: StaffWorkContractInputDto) {
    return this.contracts.update(request.user, staffId, contractId, input);
  }

  @Post(':contractId/void')
  void(@Req() request: Request & { user: AuthenticatedUser }, @Param('staffId', new ParseUUIDPipe()) staffId: string, @Param('contractId', new ParseUUIDPipe()) contractId: string) {
    return this.contracts.void(request.user, staffId, contractId);
  }
}
