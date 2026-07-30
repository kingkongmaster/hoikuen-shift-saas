import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { FeatureGuard } from './feature.guard';
import { FeaturesController, PlatformFeaturesController } from './features.controller';
import { FeaturesService } from './features.service';

@Module({ imports: [AuditModule, SubscriptionsModule], controllers: [FeaturesController, PlatformFeaturesController], providers: [FeaturesService, FeatureGuard], exports: [FeaturesService, FeatureGuard] })
export class FeaturesModule {}
