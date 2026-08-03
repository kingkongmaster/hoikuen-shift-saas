import { Module } from '@nestjs/common';
import { FeaturesModule } from '../../features/features.module';
import { MusubiProvisionalController } from './musubi-provisional.controller';
import { MusubiProvisionalService } from './musubi-provisional.service';

@Module({ imports: [FeaturesModule], controllers: [MusubiProvisionalController], providers: [MusubiProvisionalService] })
export class MusubiProvisionalModule {}
