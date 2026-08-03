import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export const STAFFING_CONSTRAINT_LEVELS = ['HARD', 'SOFT', 'INFO'] as const;
export const STAFFING_CLASS_TYPES = ['AGE_0', 'AGE_1', 'AGE_2', 'AGE_3', 'AGE_4', 'AGE_5', 'FREE', 'SUPPORT'] as const;

export class ShiftStaffingRequirementInputDto {
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/) code!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsUUID() attributeDefinitionId!: string;
  @IsOptional() @IsIn(STAFFING_CLASS_TYPES) classType?: (typeof STAFFING_CLASS_TYPES)[number] | null;
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number | null;
  @IsOptional() @IsDateString({ strict: true }) startDate?: string | null;
  @IsOptional() @IsDateString({ strict: true }) endDate?: string | null;
  @IsInt() @Min(1) requiredCount!: number;
  @IsIn(STAFFING_CONSTRAINT_LEVELS) constraintLevel!: (typeof STAFFING_CONSTRAINT_LEVELS)[number];
  @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
  @IsInt() @Min(0) @Max(100000) displayOrder!: number;
  @IsBoolean() isActive!: boolean;
}
