import { BadRequestException, Controller, Get, Param } from '@nestjs/common'
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
}
