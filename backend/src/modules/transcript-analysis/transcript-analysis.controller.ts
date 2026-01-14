import { BadRequestException, Controller, Get, Header, Param, Post, Sse } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Observable } from 'rxjs'
import { Public } from '../auth/decorators/public.decorator'
import {
  TranscriptAnalysisService,
  type TranscriptSummaryDTO,
  type TranscriptSummaryStreamEvent,
} from './transcript-analysis.service'

@ApiTags('transcript-analysis')
@Controller('transcript-analysis')
export class TranscriptAnalysisController {
  constructor(private readonly transcriptAnalysisService: TranscriptAnalysisService) {}

  @Public()
  @Get('session/:sessionId/summary')
  @ApiOperation({ summary: '获取会话已生成的 Markdown 总结（若存在）' })
  @ApiResponse({ status: 200 })
  async getStoredSummary(@Param('sessionId') sessionId: string): Promise<TranscriptSummaryDTO | null> {
    const normalized = sessionId?.trim()
    if (!normalized) {
      throw new BadRequestException('sessionId is required')
    }
    return this.transcriptAnalysisService.getStoredSummary({ sessionId: normalized })
  }

  @Public()
  @Post('session/:sessionId/summary')
  @ApiOperation({ summary: '对当前会话全文生成结构化 Markdown 总结' })
  @ApiResponse({ status: 200 })
  async generateSummary(@Param('sessionId') sessionId: string): Promise<TranscriptSummaryDTO> {
    const normalized = sessionId?.trim()
    if (!normalized) {
      throw new BadRequestException('sessionId is required')
    }
    return this.transcriptAnalysisService.generateSummary({ sessionId: normalized })
  }

  @Public()
  @Sse('session/:sessionId/summary/stream')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  @ApiOperation({ summary: '对当前会话全文生成结构化 Markdown 总结（SSE 流式）' })
  @ApiResponse({ status: 200 })
  generateSummaryStream(
    @Param('sessionId') sessionId: string
  ): Observable<{ type?: string; data: TranscriptSummaryStreamEvent['data'] }> {
    const normalized = sessionId?.trim()
    if (!normalized) {
      throw new BadRequestException('sessionId is required')
    }

    return new Observable(subscriber => {
      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'ping', data: '' })
      }, 15_000)

      void (async () => {
        try {
          for await (const evt of this.transcriptAnalysisService.generateSummaryStream({
            sessionId: normalized,
          })) {
            subscriber.next({ type: evt.type, data: evt.data })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          subscriber.next({ type: 'server_error', data: { message } })
        } finally {
          clearInterval(heartbeat)
          subscriber.complete()
        }
      })()
    })
  }
}
