import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { TranscriptGateway } from './transcript.gateway'
import { TranscriptService } from './transcript.service'
import { GlmAsrClient } from './glm-asr.client'
import { SmartAudioBufferService } from './smart-audio-buffer.service'

@Module({
  imports: [HttpModule],
  providers: [TranscriptGateway, TranscriptService, GlmAsrClient, SmartAudioBufferService],
  exports: [TranscriptService, TranscriptGateway, GlmAsrClient],
})
export class TranscriptModule {}
