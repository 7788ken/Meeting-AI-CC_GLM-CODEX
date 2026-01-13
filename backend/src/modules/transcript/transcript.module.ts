import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { TranscriptGateway } from './transcript.gateway'
import { TranscriptService } from './transcript.service'
import { DoubaoClientManager } from './doubao.client'
import { AudioBufferService } from './audio-buffer.service'
import { GlmAsrClient } from './glm-asr.client'
import { SmartAudioBufferService } from './smart-audio-buffer.service'

@Module({
  imports: [HttpModule],
  providers: [
    TranscriptGateway,
    TranscriptService,
    DoubaoClientManager,
    AudioBufferService,
    GlmAsrClient,
    SmartAudioBufferService,
  ],
  exports: [TranscriptService, TranscriptGateway, DoubaoClientManager, AudioBufferService, GlmAsrClient],
})
export class TranscriptModule {}
