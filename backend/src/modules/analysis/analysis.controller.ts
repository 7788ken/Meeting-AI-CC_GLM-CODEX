import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { AnalysisService } from './analysis.service'
import { GenerateAnalysisDto, AnalysisDto } from './dto/analysis.dto'

/**
 * AI 分析控制器
 */
@ApiTags('analysis')
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

  @Post('get-or-create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取或生成 AI 分析（使用缓存）' })
  @ApiResponse({ status: 200, type: AnalysisDto })
  async getOrCreate(@Body() dto: GenerateAnalysisDto): Promise<AnalysisDto> {
    return this.analysisService.getOrCreate(dto)
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
    @Param('analysisType') analysisType: string,
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
}
