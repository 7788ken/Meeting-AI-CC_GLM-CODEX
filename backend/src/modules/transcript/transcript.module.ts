import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { TranscriptService } from './transcript.service'
import { GlmAsrClient } from './glm-asr.client'
import { SmartAudioBufferService } from './smart-audio-buffer.service'

@Module({
  imports: [HttpModule],
  providers: [TranscriptService, GlmAsrClient, SmartAudioBufferService],
  exports: [TranscriptService, GlmAsrClient],
})
export class TranscriptModule {}
