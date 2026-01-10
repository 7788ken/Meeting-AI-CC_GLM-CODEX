import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { SpeechController } from './speech.controller'
import { SpeechService } from './speech.service'
import { SpeakerService } from './speaker.service'
import { Speech, SpeechSchema } from './schemas/speech.schema'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Speech.name, schema: SpeechSchema }]),
  ],
  controllers: [SpeechController],
  providers: [SpeechService, SpeakerService],
  exports: [SpeechService, SpeakerService],
})
export class SpeechModule {}
