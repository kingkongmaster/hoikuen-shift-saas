import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
export class CreateShiftSwapDto { @IsUUID() targetMemberId!:string; @Matches(/^\d{4}-\d{2}-\d{2}$/) requestDate!:string; @IsOptional() @IsString() @MaxLength(500) requestComment?:string; }
export class UpdateShiftSwapDto { @IsIn(['APPROVED','REJECTED']) status!: 'APPROVED'|'REJECTED'; @IsOptional() @IsString() @MaxLength(500) adminComment?:string; }
