import { BadRequestException, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import {
  TranscriptEventSegmentationService,
  TranscriptEventSegmentsSnapshotDTO,
} from './transcript-event-segmentation.service'

@ApiTags('transcript-event-segmentation')
@Controller('transcript-event-segmentation')
export class TranscriptEventSegmentationController {
  constructor(
    private readonly transcriptEventSegmentationService: TranscriptEventSegmentationService
  ) {}

  @Public()
  @Get('session/:sessionId')
  @ApiOperation({ summary: '获取会话语句拆分快照（用于刷新恢复）' })
  @ApiResponse({ status: 200 })
  async getSnapshot(
    @Param('sessionId') sessionId: string
  ): Promise<TranscriptEventSegmentsSnapshotDTO> {
    const normalized = sessionId?.trim()
    if (!normalized) {
      throw new BadRequestException('sessionId is required')
    }
    return this.transcriptEventSegmentationService.getSnapshot(normalized)
  }

  @Public()
  @Post('session/:sessionId/rebuild')
  @ApiOperation({ summary: '重拆：清空并从事件 1 重新生成语句拆分结果' })
  @ApiResponse({ status: 200 })
  async rebuild(@Param('sessionId') sessionId: string): Promise<{ started: boolean }> {
    const normalized = sessionId?.trim()
    if (!normalized) {
      throw new BadRequestException('sessionId is required')
    }
    return this.transcriptEventSegmentationService.rebuildFromStart(normalized)
  }
}
