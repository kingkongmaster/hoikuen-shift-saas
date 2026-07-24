import { IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { assignedClasses, employmentTypes, type AssignedClass, type EmploymentType } from '../../domain/staff/staff-master';

export class CreateStaffDto {
  @IsString() @IsNotEmpty() @MaxLength(50)
  employeeNumber!: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  displayName!: string;

  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string | null;

  @IsEnum(employmentTypes)
  employmentType!: EmploymentType;

  @IsEnum(assignedClasses)
  assignedClass!: AssignedClass;

  @IsBoolean()
  canWorkEarly!: boolean;

  @IsBoolean()
  canWorkRegular!: boolean;

  @IsBoolean()
  canWorkLate!: boolean;

  @IsBoolean()
  earlyShiftOnly!: boolean;

  @IsBoolean()
  lateShiftOnly!: boolean;

  @IsBoolean()
  canWorkSaturdays!: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(744)
  monthlyWorkHourLimit?: number | null;

  @IsOptional() @IsInt() @Min(1) @Max(7)
  weeklyAvailableDays?: number | null;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string | null;
}
