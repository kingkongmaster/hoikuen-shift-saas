import { IsBoolean, IsIn, IsISO8601, IsOptional } from 'class-validator';
import { FEATURE_CODES, FEATURE_SOURCES, type FeatureCode, type FeatureSource } from '../../domain/features/feature-catalog';

export class UpdateTenantFeatureDto {
  @IsIn(FEATURE_CODES) featureCode!: FeatureCode;
  @IsBoolean() enabled!: boolean;
  @IsIn(FEATURE_SOURCES) source!: FeatureSource;
  @IsOptional() @IsISO8601({ strict: true }) validFrom?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) validTo?: string | null;
}
