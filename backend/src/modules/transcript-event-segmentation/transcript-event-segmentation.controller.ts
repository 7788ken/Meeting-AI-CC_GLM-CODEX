import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { SettingsPasswordGuard } from '../app-config/guards/settings-password.guard'
import { TranscriptEventSegmentationConfigService } from './transcript-event-segmentation-config.service'
import {
  TranscriptEventSegmentationConfigDto,
  UpdateTranscriptEventSegmentationConfigDto,
} from './dto/transcript-event-segmentation-config.dto'
import {
  TranscriptEventSegmentationService,
  TranscriptEventSegmentsSnapshotDTO,
} from './transcript-event-segmentation.service'
import { TranscriptEventSegmentTranslationService } from './transcript-event-segment-translation.service'

@ApiTags('transcript-event-segmentation')
@Controller('transcript-event-segmentation')
export class TranscriptEventSegmentationController {
  constructor(
    private readonly transcriptEventSegmentationService: TranscriptEventSegmentationService,
    private readonly transcriptEventSegmentationConfigService: TranscriptEventSegmentationConfigService,
    private readonly transcriptEventSegmentTranslationService: TranscriptEventSegmentTranslationService
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
    const snapshot = await this.transcriptEventSegmentationService.getSnapshot(normalized)
    void this.transcriptEventSegmentTranslationService.translateMissingSegments(normalized)
    return snapshot
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

  @Public()
  @Get('config')
  @UseGuards(SettingsPasswordGuard)
  @ApiOperation({ summary: '获取语句拆分配置' })
  @ApiResponse({ status: 200, type: TranscriptEventSegmentationConfigDto })
  async getConfig(): Promise<TranscriptEventSegmentationConfigDto> {
    return this.transcriptEventSegmentationConfigService.reloadFromStorage()
  }

  @Public()
  @Post('config/reset')
  @UseGuards(SettingsPasswordGuard)
  @ApiOperation({ summary: '重置语句拆分配置为默认值（来自环境变量与默认 prompt）' })
  @ApiResponse({ status: 200, type: TranscriptEventSegmentationConfigDto })
  async resetConfig(): Promise<TranscriptEventSegmentationConfigDto> {
    return this.transcriptEventSegmentationConfigService.resetConfig()
  }

  @Public()
  @Put('config')
  @UseGuards(SettingsPasswordGuard)
  @ApiOperation({ summary: '更新语句拆分配置' })
  @ApiResponse({ status: 200, type: TranscriptEventSegmentationConfigDto })
  async updateConfig(
    @Body() dto: UpdateTranscriptEventSegmentationConfigDto
  ): Promise<TranscriptEventSegmentationConfigDto> {
    return this.transcriptEventSegmentationConfigService.updateConfig(dto)
  }
}
