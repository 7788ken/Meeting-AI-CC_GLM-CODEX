import { Module } from '@nestjs/common'
import { TranscriptGateway } from './transcript.gateway'
import { TranscriptService } from './transcript.service'

@Module({
  providers: [TranscriptGateway, TranscriptService],
  exports: [TranscriptService],
})
export class TranscriptModule {}
