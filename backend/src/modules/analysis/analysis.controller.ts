import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { AnalysisService } from './analysis.service'
import { GenerateAnalysisDto, AnalysisDto } from './dto/analysis.dto'
import { StreamSegmentAnalysisDto } from './dto/segment-analysis.dto'
import { Public } from '../auth/decorators/public.decorator'
import type { Request, Response } from 'express'

/**
 * AI 分析控制器
 */
@ApiTags('analysis')
@Public()
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成 AI 分析' })
  @ApiResponse({ status: 200, type: AnalysisDto })
  async generate(@Body() dto: GenerateAnalysisDto): Promise<AnalysisDto> {
    return this.analysisService.generate(dto)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取分析结果' })
  @ApiResponse({ status: 200, type: AnalysisDto })
  async findOne(@Param('id') id: string): Promise<AnalysisDto> {
    return this.analysisService.findOne(id)
  }

  @Get('session/:sessionId')
  @ApiOperation({ summary: '获取会话的所有分析记录' })
  @ApiResponse({ status: 200, type: [AnalysisDto] })
  async findBySession(@Param('sessionId') sessionId: string): Promise<AnalysisDto[]> {
    return this.analysisService.findBySession(sessionId)
  }

  @Get('session/:sessionId/type/:analysisType')
  @ApiOperation({ summary: '获取会话的特定类型分析' })
  @ApiResponse({ status: 200, type: [AnalysisDto] })
  async findByType(
    @Param('sessionId') sessionId: string,
    @Param('analysisType') analysisType: string
  ): Promise<AnalysisDto[]> {
    return this.analysisService.findByType(sessionId, analysisType)
  }

  @Delete('session/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除会话的所有分析记录' })
  @ApiResponse({ status: 204 })
  async deleteBySession(@Param('sessionId') sessionId: string): Promise<void> {
    return this.analysisService.deleteBySession(sessionId)
  }

  @Post('segment/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '语句拆分片段流式分析（SSE）' })
  async streamSegmentAnalysis(
    @Body() dto: StreamSegmentAnalysisDto,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    res.status(HttpStatus.OK)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    ;(res as any).flushHeaders?.()

    const abortController = new AbortController()
    req.on('close', () => abortController.abort())

    const writeEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    writeEvent('meta', {
      sessionId: dto.sessionId,
      segmentId: dto.segmentId,
      sequence: dto.sequence,
      analysisType: dto.analysisType,
      modelUsed: (process.env.GLM_ANALYSIS_MODEL || '').trim() || 'glm',
    })

    try {
      const { fullText, modelUsed: backendModelUsed } =
        await this.analysisService.streamSegmentAnalysis(dto, {
          signal: abortController.signal,
          onDelta: (delta) => writeEvent('chunk', { delta }),
        })

      writeEvent('done', { modelUsed: backendModelUsed, length: fullText.length })
      res.end()
    } catch (error) {
      writeEvent('error', {
        message: error instanceof Error ? error.message : String(error),
      })
      res.end()
    }
  }
}
