import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { AssignedClass, ShiftType } from '@prisma/client';
import { shiftTypes } from '../../domain/shifts/monthly-shift';

export class AssignmentInputDto {
  @IsUUID()
  staffId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'workDateはYYYY-MM-DD形式で指定してください。' })
  workDate!: string;

  @IsEnum(shiftTypes)
  shiftType!: ShiftType;

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTimeはHH:mm形式で指定してください。' })
  startTime?: string | null;

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTimeはHH:mm形式で指定してください。' })
  endTime?: string | null;

  @IsOptional() @IsInt() @Min(0)
  breakMinutes?: number | null;

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string | null;

  @IsOptional() @IsEnum(AssignedClass)
  assignedClass?: AssignedClass | null;
}

export class SaveAssignmentsDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => AssignmentInputDto)
  assignments!: AssignmentInputDto[];
}
