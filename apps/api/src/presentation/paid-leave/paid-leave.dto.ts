import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaidLeaveGrantSource, PaidLeaveUsageUnit } from '@prisma/client';

export class PaidLeaveGrantInputDto {
  @IsDateString({ strict: true }) grantDate!: string;
  @IsDateString({ strict: true }) validFrom!: string;
  @IsDateString({ strict: true }) expiresAt!: string;
  @IsInt() @Min(1) @Max(1000) grantedHalfDays!: number;
  @IsEnum(PaidLeaveGrantSource) source!: PaidLeaveGrantSource;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class PaidLeaveAllocationInputDto {
  @IsUUID() grantId!: string;
  @IsInt() @Min(1) @Max(2) allocatedHalfDays!: number;
}

export class PaidLeaveUsageInputDto {
  @IsDateString({ strict: true }) usageDate!: string;
  @IsEnum(PaidLeaveUsageUnit) unit!: PaidLeaveUsageUnit;
  @IsArray() @ArrayMaxSize(2) @ValidateNested({ each: true }) @Type(() => PaidLeaveAllocationInputDto)
  allocations!: PaidLeaveAllocationInputDto[];
  @IsOptional() @IsUUID() shiftRequestId?: string | null;
  @IsOptional() @IsUUID() shiftAssignmentId?: string | null;
  @IsString() @MinLength(1) @MaxLength(1000) decisionNote!: string;
}

export class PaidLeaveReasonDto {
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

export class PaidLeaveCorrectionDto extends PaidLeaveUsageInputDto {
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

