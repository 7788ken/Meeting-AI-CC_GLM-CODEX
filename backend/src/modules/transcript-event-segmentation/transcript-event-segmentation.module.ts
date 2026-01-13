import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { MongooseModule } from '@nestjs/mongoose'
import { TranscriptStreamModule } from '../transcript-stream/transcript-stream.module'
import { DebugErrorModule } from '../debug-error/debug-error.module'
import { TranscriptEventSegmentationController } from './transcript-event-segmentation.controller'
import { TranscriptEventSegmentationGlmClient } from './transcript-event-segmentation.glm-client'
import { TranscriptEventSegmentationService } from './transcript-event-segmentation.service'
import {
  TranscriptEventSegment,
  TranscriptEventSegmentSchema,
} from './schemas/transcript-event-segment.schema'

@Module({
  imports: [
    HttpModule,
    TranscriptStreamModule,
    DebugErrorModule,
    MongooseModule.forFeature([
      { name: TranscriptEventSegment.name, schema: TranscriptEventSegmentSchema },
    ]),
  ],
  controllers: [TranscriptEventSegmentationController],
  providers: [TranscriptEventSegmentationService, TranscriptEventSegmentationGlmClient],
  exports: [TranscriptEventSegmentationService],
})
export class TranscriptEventSegmentationModule {}
