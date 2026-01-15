import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { MongooseModule } from '@nestjs/mongoose'
import { TranscriptStreamModule } from '../transcript-stream/transcript-stream.module'
import {
  TranscriptEventSegment,
  TranscriptEventSegmentSchema,
} from '../transcript-event-segmentation/schemas/transcript-event-segment.schema'
import { TranscriptAnalysisController } from './transcript-analysis.controller'
import { TranscriptAnalysisConfigService } from './transcript-analysis-config.service'
import { TranscriptAnalysisGlmClient } from './transcript-analysis.glm-client'
import { TranscriptAnalysisService } from './transcript-analysis.service'
import {
  TranscriptAnalysisSummary,
  TranscriptAnalysisSummarySchema,
} from './schemas/transcript-analysis-summary.schema'
import {
  TranscriptAnalysisSegmentAnalysis,
  TranscriptAnalysisSegmentAnalysisSchema,
} from './schemas/transcript-analysis-segment.schema'

@Module({
  imports: [
    HttpModule,
    TranscriptStreamModule,
    MongooseModule.forFeature([
      { name: TranscriptAnalysisSummary.name, schema: TranscriptAnalysisSummarySchema },
      {
        name: TranscriptAnalysisSegmentAnalysis.name,
        schema: TranscriptAnalysisSegmentAnalysisSchema,
      },
      { name: TranscriptEventSegment.name, schema: TranscriptEventSegmentSchema },
    ]),
  ],
  controllers: [TranscriptAnalysisController],
  providers: [TranscriptAnalysisService, TranscriptAnalysisConfigService, TranscriptAnalysisGlmClient],
})
export class TranscriptAnalysisModule {}
