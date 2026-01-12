import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { TranscriptStreamService, TranscriptStreamSnapshotDTO } from './transcript-stream.service'

@ApiTags('transcript-stream')
@Controller('transcript-stream')
export class TranscriptStreamController {
  constructor(private readonly transcriptStreamService: TranscriptStreamService) {}

  @Public()
  @Get('session/:sessionId')
  @ApiOperation({ summary: '获取会话原文事件流快照' })
  @ApiResponse({ status: 200 })
  async getSessionSnapshot(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: string
  ): Promise<TranscriptStreamSnapshotDTO> {
    const parsedLimit = limit == null ? undefined : Number(limit)
    return this.transcriptStreamService.getSnapshot({ sessionId, limit: parsedLimit })
  }
}

