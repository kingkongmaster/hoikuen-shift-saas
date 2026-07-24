import { Controller, Get, Header, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response, Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { AuditExportQueryDto, MonthExportQueryDto } from './exports.dto';
import { ExportsService } from './exports.service';

@Controller('exports') @UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}
  @Get('shifts.csv') @Roles('ADMIN', 'DIRECTOR') async shifts(@Req() req: Request & { user: AuthenticatedUser }, @Query() query: MonthExportQueryDto, @Res() res: Response) { return this.download(res, `enshift-shifts-${query.month}.csv`, await this.exports.shiftsCsv(req.user, query.month)); }
  @Get('staff.csv') @Roles('ADMIN', 'DIRECTOR') async staff(@Req() req: Request & { user: AuthenticatedUser }, @Res() res: Response) { return this.download(res, 'enshift-staff.csv', await this.exports.staffCsv(req.user)); }
  @Get('shift-requests.csv') @Roles('ADMIN', 'DIRECTOR') async requests(@Req() req: Request & { user: AuthenticatedUser }, @Query() query: MonthExportQueryDto, @Res() res: Response) { return this.download(res, `enshift-shift-requests-${query.month}.csv`, await this.exports.requestsCsv(req.user, query.month)); }
  @Get('audit.csv') @Roles('ADMIN', 'DIRECTOR') async audit(@Req() req: Request & { user: AuthenticatedUser }, @Query() query: AuditExportQueryDto, @Res() res: Response) { return this.download(res, 'enshift-audit-logs.csv', await this.exports.auditCsv(req.user, query)); }
  @Get('print/shifts') @Roles('ADMIN', 'DIRECTOR') print(@Req() req: Request & { user: AuthenticatedUser }, @Query() query: MonthExportQueryDto) { return this.exports.printData(req.user, query.month, false); }
  @Get('print/my-shift') printOwn(@Req() req: Request & { user: AuthenticatedUser }, @Query() query: MonthExportQueryDto) { return this.exports.printData(req.user, query.month, true); }
  private download(res: Response, name: string, body: string) { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}"`); return res.send(body); }
}
