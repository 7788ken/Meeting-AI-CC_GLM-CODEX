import { BadRequestException, Controller, Get, Param } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import {
  GetSessionAnalysisResponse,
  TranscriptAnalysisService,
} from './transcript-analysis.service'

@ApiTags('transcript-analysis')
@Controller('transcript-analysis')
export class TranscriptAnalysisController {
  constructor(private readonly transcriptAnalysisService: TranscriptAnalysisService) {}

  @Public()
  @Get('session/:sessionId')
  @ApiOperation({ summary: '获取会话转写分析快照（用于刷新恢复）' })
  @ApiResponse({ status: 200 })
  async getSessionAnalysis(
    @Param('sessionId') sessionId: string
  ): Promise<GetSessionAnalysisResponse> {
    const normalized = sessionId?.trim()
    if (!normalized) {
      throw new BadRequestException('sessionId is required')
    }
    return this.transcriptAnalysisService.getSessionAnalysis(normalized)
  }
}
