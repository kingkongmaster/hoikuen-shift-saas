import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateStaffLoginAccountDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{2,63}$/, { message: 'ログインIDは3〜64文字の半角英小文字・数字・._-で入力してください。' })
  loginId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsIn(['DIRECTOR', 'CHIEF', 'STAFF'])
  role!: 'DIRECTOR' | 'CHIEF' | 'STAFF';

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  temporaryPassword!: string;

  @IsString()
  confirmPassword!: string;
}

export class ResetStaffPasswordDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  temporaryPassword!: string;

  @IsString()
  confirmPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class StaffLoginAccountReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
