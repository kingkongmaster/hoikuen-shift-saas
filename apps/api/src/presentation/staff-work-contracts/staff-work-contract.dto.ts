import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class StaffWorkContractInputDto {
  @IsDateString({ strict: true })
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  effectiveTo?: string | null;

  @IsInt()
  @Min(1)
  @Max(10_000_000)
  annualizedTargetMinutes!: number;

  @IsInt()
  @Min(1)
  @Max(1_440)
  prescribedDailyMinutes!: number;
}
