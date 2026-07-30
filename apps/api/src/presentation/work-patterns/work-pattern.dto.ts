import { IsBoolean, IsHexColor, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class WorkPatternInputDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,31}$/) code!: string;
  @IsString() @MaxLength(50) name!: string;
  @IsString() @MaxLength(8) shortName!: string;
  @IsInt() @Min(0) @Max(999) displayOrder!: number;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string | null;
  @IsInt() @Min(0) @Max(480) breakMinutes!: number;
  @IsOptional() @IsHexColor() color?: string | null;
  @IsBoolean() isWorking!: boolean;
  @IsBoolean() isDefault!: boolean;
  @IsBoolean() isActive!: boolean;
}
