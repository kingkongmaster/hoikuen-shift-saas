import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeInitialPasswordDto {
  @IsString() @MaxLength(128) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword!: string;
  @IsString() @MinLength(12) @MaxLength(128) confirmPassword!: string;
}
