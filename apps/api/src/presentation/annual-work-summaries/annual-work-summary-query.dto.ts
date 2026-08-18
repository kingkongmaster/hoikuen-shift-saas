import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class AnnualWorkSummaryQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  fiscalYear!: number;
}
