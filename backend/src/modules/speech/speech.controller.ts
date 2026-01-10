import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { SpeechService } from './speech.service'
import { CreateSpeechDto, UpdateSpeechDto, SpeechDto } from './dto/speech.dto'

/**
 * 发言记录控制器 (B1027, B1028, B1029, B1030)
 */
@ApiTags('speeches')
@Controller('speeches')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建发言记录' })
  @ApiResponse({ status: 201, type: SpeechDto })
  async create(@Body() dto: CreateSpeechDto): Promise<SpeechDto> {
    return this.speechService.create(dto)
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '批量创建发言记录' })
  @ApiResponse({ status: 201, type: [SpeechDto] })
  async batchCreate(@Body() dtos: CreateSpeechDto[]): Promise<SpeechDto[]> {
    return this.speechService.batchCreate(dtos)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取发言详情' })
  @ApiResponse({ status: 200, type: SpeechDto })
  async findOne(@Param('id') id: string): Promise<SpeechDto> {
    return this.speechService.findOne(id)
  }

  @Get('session/:sessionId')
  @ApiOperation({ summary: '获取会话的所有发言记录' })
  @ApiResponse({ status: 200, type: [SpeechDto] })
  async findBySession(@Param('sessionId') sessionId: string): Promise<SpeechDto[]> {
    return this.speechService.findBySession(sessionId)
  }

  @Get('session/:sessionId/speaker/:speakerId')
  @ApiOperation({ summary: '获取发言者的所有发言记录' })
  @ApiResponse({ status: 200, type: [SpeechDto] })
  async findBySpeaker(
    @Param('sessionId') sessionId: string,
    @Param('speakerId') speakerId: string
  ): Promise<SpeechDto[]> {
    return this.speechService.findBySpeaker(sessionId, speakerId)
  }

  @Get('session/:sessionId/search')
  @ApiOperation({ summary: '搜索发言记录' })
  @ApiResponse({ status: 200, type: [SpeechDto] })
  async search(
    @Param('sessionId') sessionId: string,
    @Query('keyword') keyword: string
  ): Promise<SpeechDto[]> {
    return this.speechService.search(sessionId, keyword)
  }

  @Put(':id')
  @ApiOperation({ summary: '更新发言记录 (B1029)' })
  @ApiResponse({ status: 200, type: SpeechDto })
  async update(@Param('id') id: string, @Body() dto: UpdateSpeechDto): Promise<SpeechDto> {
    return this.speechService.update(id, dto)
  }

  @Put(':id/mark')
  @ApiOperation({ summary: '标记/取消标记发言记录' })
  @ApiResponse({ status: 200, type: SpeechDto })
  async toggleMark(
    @Param('id') id: string,
    @Body() body: { marked: boolean; reason?: string }
  ): Promise<SpeechDto> {
    return this.speechService.toggleMark(id, body.marked, body.reason)
  }

  @Delete('session/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除会话的所有发言记录' })
  @ApiResponse({ status: 204 })
  async deleteBySession(@Param('sessionId') sessionId: string): Promise<void> {
    return this.speechService.deleteBySession(sessionId)
  }
}
