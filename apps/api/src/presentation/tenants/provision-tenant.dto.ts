import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ProvisionTenantDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @Matches(/^[a-z0-9-]{3,40}$/) code!: string;
  @Matches(/^[a-z0-9][a-z0-9._-]{2,63}$/) adminLoginId!: string;
  @IsString() @MinLength(1) @MaxLength(100) adminDisplayName!: string;
  @IsOptional() @IsString() @MinLength(12) @MaxLength(128) initialPassword?: string;
}
