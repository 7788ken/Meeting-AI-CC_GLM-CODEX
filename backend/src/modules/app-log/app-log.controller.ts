import { Controller, Delete, Get, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { AppLogService, type AppLogType } from './app-log.service'
import { AppLogDto } from './dto/app-log.dto'

@ApiTags('app-logs')
@Controller('app-logs')
export class AppLogController {
  constructor(private readonly appLogService: AppLogService) {}

  @Public()
  @Get('session/:sessionId')
  @ApiOperation({ summary: '获取会话日志列表' })
  @ApiResponse({ status: 200, type: [AppLogDto] })
  async findBySession(
    @Param('sessionId') sessionId: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string
  ): Promise<AppLogDto[]> {
    const normalizedType = this.normalizeType(type)
    const normalizedLimit = Number(limit)
    return this.appLogService.findBySession(sessionId, normalizedType, normalizedLimit)
  }

  @Public()
  @Delete('session/:sessionId')
  @ApiOperation({ summary: '清空会话日志' })
  @ApiResponse({ status: 200 })
  async deleteBySession(
    @Param('sessionId') sessionId: string,
    @Query('type') type?: string
  ): Promise<{ deletedCount: number }> {
    const normalizedType = this.normalizeType(type)
    return this.appLogService.deleteBySession(sessionId, normalizedType)
  }

  private normalizeType(type?: string): AppLogType | undefined {
    if (!type) return undefined
    const normalized = type.trim().toLowerCase()
    if (
      normalized === 'request_response' ||
      normalized === 'error' ||
      normalized === 'system'
    ) {
      return normalized as AppLogType
    }
    return undefined
  }
}
