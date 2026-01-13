import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { MongooseModule } from '@nestjs/mongoose'
import { TranscriptStreamModule } from '../transcript-stream/transcript-stream.module'
import { DebugErrorModule } from '../debug-error/debug-error.module'
import { TranscriptAnalysisGlmClient } from './transcript-analysis.glm-client'
import { TranscriptAnalysisController } from './transcript-analysis.controller'
import { TranscriptAnalysisService } from './transcript-analysis.service'
import {
  TranscriptAnalysisChunk,
  TranscriptAnalysisChunkSchema,
} from './schemas/transcript-analysis-chunk.schema'
import {
  TranscriptAnalysisState,
  TranscriptAnalysisStateSchema,
} from './schemas/transcript-analysis-state.schema'

@Module({
  imports: [
    HttpModule,
    TranscriptStreamModule,
    DebugErrorModule,
    MongooseModule.forFeature([
      { name: TranscriptAnalysisChunk.name, schema: TranscriptAnalysisChunkSchema },
      { name: TranscriptAnalysisState.name, schema: TranscriptAnalysisStateSchema },
    ]),
  ],
  controllers: [TranscriptAnalysisController],
  providers: [TranscriptAnalysisService, TranscriptAnalysisGlmClient],
  exports: [TranscriptAnalysisService],
})
export class TranscriptAnalysisModule {}
