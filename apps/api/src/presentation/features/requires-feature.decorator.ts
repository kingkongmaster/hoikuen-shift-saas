import { SetMetadata } from '@nestjs/common';
import type { FeatureCode } from '../../domain/features/feature-catalog';

export const REQUIRED_FEATURE_KEY = 'requiredFeature';
export const RequiresFeature = (feature: FeatureCode) => SetMetadata(REQUIRED_FEATURE_KEY, feature);
