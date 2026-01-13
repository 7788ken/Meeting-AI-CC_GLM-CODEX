import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { TranscriptStreamController } from './transcript-stream.controller'
import { TranscriptStreamService } from './transcript-stream.service'
import { TranscriptEvent, TranscriptEventSchema } from './schemas/transcript-event.schema'
import { TranscriptState, TranscriptStateSchema } from './schemas/transcript-state.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TranscriptEvent.name, schema: TranscriptEventSchema },
      { name: TranscriptState.name, schema: TranscriptStateSchema },
    ]),
  ],
  controllers: [TranscriptStreamController],
  providers: [TranscriptStreamService],
  exports: [TranscriptStreamService],
})
export class TranscriptStreamModule {}
