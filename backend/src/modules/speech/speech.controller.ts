import { Controller, Get, Post, Put, Body, Param, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { SpeechService } from './speech.service'
import { CreateSpeechDto, UpdateSpeechDto, SpeechDto } from './dto/speech.dto'

@ApiTags('speeches')
@Controller('speeches')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建发言记录' })
  @ApiResponse({ status: 201, type: SpeechDto })
  create(@Body() dto: CreateSpeechDto): SpeechDto {
    return this.speechService.create(dto)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取发言详情' })
  @ApiResponse({ status: 200, type: SpeechDto })
  async findOne(@Param('id') id: string): Promise<SpeechDto> {
    return this.speechService.findOne(id)
  }

  @Put(':id')
  @ApiOperation({ summary: '更新发言记录' })
  @ApiResponse({ status: 200, type: SpeechDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSpeechDto
  ): Promise<SpeechDto> {
    return this.speechService.update(id, dto)
  }
}
