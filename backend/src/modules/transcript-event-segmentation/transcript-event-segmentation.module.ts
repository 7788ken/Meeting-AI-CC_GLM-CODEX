import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { MongooseModule } from '@nestjs/mongoose'
import { TranscriptStreamModule } from '../transcript-stream/transcript-stream.module'
import { DebugErrorModule } from '../debug-error/debug-error.module'
import { AppLogModule } from '../app-log/app-log.module'
import { TranscriptEventSegmentationController } from './transcript-event-segmentation.controller'
import { TranscriptEventSegmentationConfigService } from './transcript-event-segmentation-config.service'
import { TranscriptEventSegmentationGlmClient } from './transcript-event-segmentation.glm-client'
import { TranscriptEventSegmentationService } from './transcript-event-segmentation.service'
import { TranscriptEventSegmentTranslationGlmClient } from './transcript-event-segment-translation.glm-client'
import { TranscriptEventSegmentTranslationService } from './transcript-event-segment-translation.service'
import {
  TranscriptEventSegment,
  TranscriptEventSegmentSchema,
} from './schemas/transcript-event-segment.schema'

@Module({
  imports: [
    HttpModule,
    TranscriptStreamModule,
    DebugErrorModule,
    AppLogModule,
    MongooseModule.forFeature([
      { name: TranscriptEventSegment.name, schema: TranscriptEventSegmentSchema },
    ]),
  ],
  controllers: [TranscriptEventSegmentationController],
  providers: [
    TranscriptEventSegmentationService,
    TranscriptEventSegmentationGlmClient,
    TranscriptEventSegmentationConfigService,
    TranscriptEventSegmentTranslationService,
    TranscriptEventSegmentTranslationGlmClient,
  ],
  exports: [
    TranscriptEventSegmentationService,
    TranscriptEventSegmentationConfigService,
    TranscriptEventSegmentTranslationService,
  ],
})
export class TranscriptEventSegmentationModule {}
