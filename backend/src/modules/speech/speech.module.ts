import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { SpeechController } from './speech.controller'
import { SpeechService } from './speech.service'
import { Speech, SpeechSchema } from './schemas/speech.schema'

@Module({
  imports: [MongooseModule.forFeature([{ name: Speech.name, schema: SpeechSchema }])],
  controllers: [SpeechController],
  providers: [SpeechService],
  exports: [SpeechService],
})
export class SpeechModule {}
