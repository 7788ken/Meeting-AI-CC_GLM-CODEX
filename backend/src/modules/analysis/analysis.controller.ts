import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { AnalysisService } from './analysis.service'
import { GenerateAnalysisDto, AnalysisDto } from './dto/analysis.dto'

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成AI分析' })
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
}
