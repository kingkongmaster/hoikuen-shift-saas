import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';
import { AssignedClass } from '@prisma/client';

export class UpdateShiftSettingDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) weekdayEarlyRequired?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) weekdayLateRequired?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) saturdayEarlyRequired?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) saturdayLateRequired?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) saturdayMinimumStaff?: number;
  @IsOptional() @IsBoolean() saturdayOperationEnabled?: boolean;
  @IsOptional() @IsBoolean() sundayOperationEnabled?: boolean;
  @IsOptional() @IsBoolean() directorCountsTowardStaffing?: boolean;
  @IsOptional() @IsIn(['NONE', 'SHORTAGE_ONLY', 'NORMAL']) directorClassPlacementMode?: 'NONE' | 'SHORTAGE_ONLY' | 'NORMAL';
  @IsOptional() @IsInt() @Min(1) @Max(14) maxConsecutiveWorkDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(7) maxConsecutiveEarlyDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(7) maxConsecutiveLateDays?: number;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) defaultStartEarly?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) defaultEndEarly?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) defaultStartNormal?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) defaultEndNormal?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) defaultStartLate?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) defaultEndLate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(480) defaultBreakMinutes?: number;
}
export class ClassRequirementDto { @IsEnum(AssignedClass) classType!: AssignedClass; @IsInt() @Min(0) @Max(100) weekdayRequired!: number; @IsInt() @Min(0) @Max(100) saturdayRequired!: number; @IsBoolean() isActive!: boolean; }
export class UpdateClassRequirementsDto { @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => ClassRequirementDto) requirements!: ClassRequirementDto[]; }
