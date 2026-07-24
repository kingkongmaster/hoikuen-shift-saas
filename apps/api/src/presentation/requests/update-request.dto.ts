import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { shiftRequestStatuses, shiftRequestTypes, type ShiftRequestStatus, type ShiftRequestType } from '../../domain/requests/shift-request';

export class UpdateRequestDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'requestDateはYYYY-MM-DD形式で指定してください。' })
  requestDate?: string;

  @IsOptional() @IsEnum(shiftRequestTypes)
  requestType?: ShiftRequestType;

  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string | null;

  @IsOptional() @IsEnum(shiftRequestStatuses)
  status?: ShiftRequestStatus;

  @IsOptional() @IsString() @MaxLength(1000)
  adminComment?: string | null;
}
