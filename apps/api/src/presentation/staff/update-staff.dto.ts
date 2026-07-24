import { IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { assignedClasses, employmentTypes, type AssignedClass, type EmploymentType } from '../../domain/staff/staff-master';

export class UpdateStaffDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50)
  employeeNumber?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100)
  displayName?: string;

  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string | null;

  @IsOptional() @IsEnum(employmentTypes)
  employmentType?: EmploymentType;

  @IsOptional() @IsEnum(assignedClasses)
  assignedClass?: AssignedClass;

  @IsOptional() @IsBoolean()
  canWorkEarly?: boolean;

  @IsOptional() @IsBoolean()
  canWorkRegular?: boolean;

  @IsOptional() @IsBoolean()
  canWorkLate?: boolean;

  @IsOptional() @IsBoolean()
  earlyShiftOnly?: boolean;

  @IsOptional() @IsBoolean()
  lateShiftOnly?: boolean;

  @IsOptional() @IsBoolean()
  canWorkSaturdays?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(744)
  monthlyWorkHourLimit?: number | null;

  @IsOptional() @IsInt() @Min(1) @Max(7)
  weeklyAvailableDays?: number | null;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string | null;
}
