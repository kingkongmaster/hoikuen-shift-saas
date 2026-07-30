import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export const STAFF_WORK_RULE_TYPES = [
  'AVAILABLE_WORK_PATTERN','UNAVAILABLE_WORK_PATTERN','AVAILABLE_DAY_OF_WEEK','UNAVAILABLE_DAY_OF_WEEK',
  'AVAILABLE_TIME_RANGE','UNAVAILABLE_TIME_RANGE','MAX_WORK_DAYS_PER_WEEK','MAX_WORK_DAYS_PER_MONTH',
  'MAX_WORK_MINUTES_PER_MONTH','MIN_WORK_DAYS_PER_MONTH','MIN_WORK_MINUTES_PER_MONTH',
  'MAX_CONSECUTIVE_WORK_DAYS','REQUIRED_DAY_OFF','FIXED_WORK_PATTERN','PREFERRED_WORK_PATTERN',
] as const;
export type StaffWorkRuleTypeValue = (typeof STAFF_WORK_RULE_TYPES)[number];

export class StaffWorkRuleInputDto {
  @IsIn(STAFF_WORK_RULE_TYPES) ruleType!: StaffWorkRuleTypeValue;
  @IsOptional() @IsUUID() workPatternId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number | null;
  @IsOptional() @IsDateString({ strict: true }) startDate?: string | null;
  @IsOptional() @IsDateString({ strict: true }) endDate?: string | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string | null;
  @IsOptional() @IsInt() @Min(0) numericValue?: number | null;
  @IsOptional() @IsBoolean() booleanValue?: boolean | null;
  @IsInt() @Min(0) @Max(1000) priority!: number;
  @IsBoolean() isHardConstraint!: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
  @IsBoolean() isActive!: boolean;
}
