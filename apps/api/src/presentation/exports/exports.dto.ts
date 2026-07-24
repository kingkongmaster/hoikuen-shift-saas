import { IsOptional, Matches } from 'class-validator';

export class MonthExportQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}

export class AuditExportQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() memberId?: string;
  @IsOptional() action?: string;
  @IsOptional() targetType?: string;
}
