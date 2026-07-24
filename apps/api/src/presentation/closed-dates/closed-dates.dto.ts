import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
export class ClosedDateInputDto { @Matches(/^\d{4}-\d{2}-\d{2}$/) closedDate!: string; @IsString() @MaxLength(100) name!: string; @IsOptional() @IsString() @MaxLength(1000) note?: string | null; }
