import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { shiftRequestTypes, type ShiftRequestType } from '../../domain/requests/shift-request';

export class CreateRequestDto {
  @IsOptional() @IsUUID()
  staffId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'requestDateはYYYY-MM-DD形式で指定してください。' })
  requestDate!: string;

  @IsEnum(shiftRequestTypes)
  requestType!: ShiftRequestType;

  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string | null;
}
