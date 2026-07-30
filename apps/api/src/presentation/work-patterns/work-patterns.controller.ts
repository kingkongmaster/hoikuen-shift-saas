import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { SubscriptionWriteGuard } from '../subscriptions/subscription-write.guard';
import { WorkPatternInputDto } from './work-pattern.dto';
import { WorkPatternsService } from './work-patterns.service';

@Controller('work-patterns') @UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard, SubscriptionWriteGuard) @Roles('ADMIN', 'DIRECTOR')
export class WorkPatternsController {
  constructor(private readonly patterns: WorkPatternsService) {}
  @Get() list(@Req() req: Request & { user: AuthenticatedUser }) { return this.patterns.list(req.user); }
  @Post() @Roles('ADMIN') create(@Req() req: Request & { user: AuthenticatedUser }, @Body() input: WorkPatternInputDto) { return this.patterns.create(req.user, input); }
  @Put(':id') @Roles('ADMIN') update(@Req() req: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: WorkPatternInputDto) { return this.patterns.update(req.user, id, input); }
  @Delete(':id') @Roles('ADMIN') remove(@Req() req: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) { return this.patterns.remove(req.user, id); }
}
