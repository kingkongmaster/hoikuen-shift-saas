import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { HealthController } from './health.controller';
import { ReadinessController } from './readiness.controller';

@Module({ imports: [DatabaseModule], controllers: [HealthController, ReadinessController] })
export class HealthModule {}
