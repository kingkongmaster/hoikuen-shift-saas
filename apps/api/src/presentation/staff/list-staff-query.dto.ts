import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListStaffQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true ? true : value === 'false' || value === false ? false : value)
  @IsBoolean()
  includeInactive = false;
}
