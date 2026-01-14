import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { MongooseModule } from '@nestjs/mongoose'
import { TranscriptStreamModule } from '../transcript-stream/transcript-stream.module'
import { TranscriptAnalysisController } from './transcript-analysis.controller'
import { TranscriptAnalysisGlmClient } from './transcript-analysis.glm-client'
import { TranscriptAnalysisService } from './transcript-analysis.service'
import {
  TranscriptAnalysisSummary,
  TranscriptAnalysisSummarySchema,
} from './schemas/transcript-analysis-summary.schema'

@Module({
  imports: [
    HttpModule,
    TranscriptStreamModule,
    MongooseModule.forFeature([
      { name: TranscriptAnalysisSummary.name, schema: TranscriptAnalysisSummarySchema },
    ]),
  ],
  controllers: [TranscriptAnalysisController],
  providers: [TranscriptAnalysisService, TranscriptAnalysisGlmClient],
})
export class TranscriptAnalysisModule {}
