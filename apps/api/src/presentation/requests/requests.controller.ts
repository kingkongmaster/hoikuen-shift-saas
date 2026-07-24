import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { SubscriptionWriteGuard } from '../subscriptions/subscription-write.guard';
import { CreateRequestDto } from './create-request.dto';
import { ListRequestsQueryDto } from './list-requests-query.dto';
import { RequestsService } from './requests.service';
import { UpdateRequestDto } from './update-request.dto';

@Controller('requests')
@UseGuards(JwtAuthGuard, TenantAccessGuard, SubscriptionWriteGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@Req() request: Request & { user: AuthenticatedUser }, @Query() query: ListRequestsQueryDto) {
    return this.requests.list(request.user, query.month, query.staffId);
  }

  @Get('staff-options')
  staffOptions(@Req() request: Request & { user: AuthenticatedUser }) {
    return this.requests.staffOptions(request.user);
  }

  @Get(':id')
  get(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.requests.get(request.user, id);
  }

  @Post()
  create(@Req() request: Request & { user: AuthenticatedUser }, @Body() input: CreateRequestDto) {
    return this.requests.create(request.user, input);
  }

  @Patch(':id')
  update(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: UpdateRequestDto) {
    return this.requests.update(request.user, id, input);
  }

  @Delete(':id')
  cancel(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.requests.cancel(request.user, id);
  }
}
