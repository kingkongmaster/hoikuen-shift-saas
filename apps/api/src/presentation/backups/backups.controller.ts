import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response, Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { BackupInputDto } from './backups.dto';
import { BackupsService } from './backups.service';
@Controller('backups') @UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard) @Roles('ADMIN', 'DIRECTOR')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}
  @Post('export') async export(@Req() req: Request & { user: AuthenticatedUser }, @Res() res: Response) { const backup = await this.backups.export(req.user); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="enshift-backup.json"'); return res.send(backup); }
  @Post('validate') validate(@Req() req: Request & { user: AuthenticatedUser }, @Body() input: BackupInputDto) { return this.backups.validate(req.user, input.backup); }
  @Post('preview-restore') preview(@Req() req: Request & { user: AuthenticatedUser }, @Body() input: BackupInputDto) { return this.backups.preview(req.user, input.backup); }
}
