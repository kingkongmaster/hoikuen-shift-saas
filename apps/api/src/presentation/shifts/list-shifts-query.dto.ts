import { IsOptional, IsUUID, Matches } from 'class-validator';

export class ListShiftsQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthはYYYY-MM形式で指定してください。' })
  month!: string;

  @IsOptional() @IsUUID()
  staffId?: string;
}
