import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
export class DepartmentInput {
  @Matches(/^[A-Z][A-Z0-9_]{0,31}$/) code!: string;
  @IsString() @MaxLength(80) name!: string;
  @IsInt() @Min(0) @Max(999) displayOrder!: number;
  @IsBoolean() isActive!: boolean;
}
export class DepartmentAssignmentInput {
  @IsUUID() departmentId!: string;
  @IsBoolean() isPrimary!: boolean;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) startDate?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) endDate?: string;
}
