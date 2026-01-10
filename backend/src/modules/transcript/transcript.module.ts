import { Module } from '@nestjs/common'
import { TranscriptGateway } from './transcript.gateway'
import { TranscriptService } from './transcript.service'
import { DoubaoClientManager } from './doubao.client'

@Module({
  providers: [
    TranscriptGateway,
    TranscriptService,
    DoubaoClientManager,
  ],
  exports: [TranscriptService, TranscriptGateway, DoubaoClientManager],
})
export class TranscriptModule {}
