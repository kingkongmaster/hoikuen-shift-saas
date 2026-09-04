import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class TenantEventInputDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) eventDate!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsIn(['ONSITE','OFFSITE','OTHER']) eventType!: string;
  @IsOptional() @IsArray() @IsString({each:true}) targetClasses?: string[];
  @IsOptional() @IsArray() @IsString({each:true}) targetStaffCodes?: string[];
  @IsOptional() @IsArray() @IsString({each:true}) allowedWorkPatternCodes?: string[];
  @IsOptional() @IsBoolean() fixedTimeStaffAllowed?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsIn(['ADMIN_CONFIRMED']) sourceType!: string;
  @IsOptional() @IsString() @MaxLength(500) sourceReference?: string;
}

export class RuleExceptionInputDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) exceptionDate!: string;
  @IsIn(['WEEKLY_ROTATION_LIMIT','STAFF_WORK_PATTERN','HARD_RULE_OVERRIDE']) exceptionType!: string;
  @IsObject() configuration!: Record<string,unknown>;
  @IsString() @MaxLength(500) reason!: string;
  @IsIn(['ADMIN_CONFIRMED']) sourceType!: string;
  @IsOptional() @IsString() @MaxLength(500) sourceReference?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) version?: number;
}
