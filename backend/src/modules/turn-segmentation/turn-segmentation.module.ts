import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { MongooseModule } from '@nestjs/mongoose'
import { TranscriptStreamModule } from '../transcript-stream/transcript-stream.module'
import { TurnSegmentationController } from './turn-segmentation.controller'
import { TurnSegmentationGlmClient } from './turn-segmentation.glm-client'
import { TurnSegmentationService } from './turn-segmentation.service'
import { TurnSegments, TurnSegmentsSchema } from './schemas/turn-segments.schema'

@Module({
  imports: [
    HttpModule,
    TranscriptStreamModule,
    MongooseModule.forFeature([{ name: TurnSegments.name, schema: TurnSegmentsSchema }]),
  ],
  controllers: [TurnSegmentationController],
  providers: [TurnSegmentationService, TurnSegmentationGlmClient],
  exports: [TurnSegmentationService],
})
export class TurnSegmentationModule {}
