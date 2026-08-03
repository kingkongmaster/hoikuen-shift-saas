import { IsBoolean, IsDateString, IsEmpty, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export const STAFF_ATTRIBUTE_CATEGORIES = ['ROLE','QUALIFICATION','ASSIGNMENT','SKILL'] as const;
export type StaffAttributeCategoryValue = (typeof STAFF_ATTRIBUTE_CATEGORIES)[number];

export class StaffAttributeDefinitionCreateDto {
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/) code!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(30) shortName?: string | null;
  @IsIn(STAFF_ATTRIBUTE_CATEGORIES) category!: StaffAttributeCategoryValue;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsInt() @Min(0) @Max(100000) displayOrder!: number;
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string | null;
  @IsBoolean() isActive!: boolean;
  @IsOptional() @IsEmpty({ message: 'isSystemは指定できません。' }) isSystem?: never;
}

export class StaffAttributeDefinitionUpdateDto extends StaffAttributeDefinitionCreateDto {}

export class StaffAttributeAssignmentInputDto {
  @IsUUID() attributeDefinitionId!: string;
  @IsOptional() @IsDateString({ strict: true }) startDate?: string | null;
  @IsOptional() @IsDateString({ strict: true }) endDate?: string | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @IsBoolean() isPrimary!: boolean;
  @IsBoolean() isActive!: boolean;
}
