import { Controller, Get, Param } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { TurnSegmentationService, TurnSegmentsSnapshotDTO } from './turn-segmentation.service'

@ApiTags('turn-segmentation')
@Controller('turn-segmentation')
export class TurnSegmentationController {
  constructor(private readonly turnSegmentationService: TurnSegmentationService) {}

  @Public()
  @Get('session/:sessionId')
  @ApiOperation({ summary: '获取会话轮次分段快照（用于刷新恢复）' })
  @ApiResponse({ status: 200 })
  async getSnapshot(@Param('sessionId') sessionId: string): Promise<TurnSegmentsSnapshotDTO> {
    return this.turnSegmentationService.getSnapshot(sessionId)
  }
}

