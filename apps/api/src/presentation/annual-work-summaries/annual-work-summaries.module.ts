import { Module } from '@nestjs/common';
import { AnnualWorkSummariesController } from './annual-work-summaries.controller';
import { AnnualWorkSummariesService } from './annual-work-summaries.service';

@Module({ controllers: [AnnualWorkSummariesController], providers: [AnnualWorkSummariesService] })
export class AnnualWorkSummariesModule {}
