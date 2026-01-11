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
import { Public } from '../auth/decorators/public.decorator'

/**
 * 发言记录控制器 (B1027, B1028, B1029, B1030)
 *
 * 安全策略：
 * - 写操作（POST/PUT/DELETE）：需要 JWT 认证，防止恶意篡改
 * - 读操作（GET）：公开访问，便于 MVP 演示，正式版本需添加认证
 *
 * 路由顺序注意：通配符路由（如 GET /:id）必须放在更具体的路由之后，避免误匹配（例如把 "session" 当作 id）
 */
@ApiTags('speeches')
@Controller('speeches')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  /**
   * 创建发言记录 - 需要认证
   * 防止未授权用户创建发言记录
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建发言记录' })
  @ApiResponse({ status: 201, type: SpeechDto })
  async create(@Body() dto: CreateSpeechDto): Promise<SpeechDto> {
    return this.speechService.create(dto)
  }

  /**
   * 批量创建发言记录 - 需要认证
   */
  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '批量创建发言记录' })
  @ApiResponse({ status: 201, type: [SpeechDto] })
  async batchCreate(@Body() dtos: CreateSpeechDto[]): Promise<SpeechDto[]> {
    return this.speechService.batchCreate(dtos)
  }

  /**
   * 获取会话的所有发言记录 - 公开访问
   * TODO: 正式版本需添加认证和会话归属校验
   */
  @Public()
  @Get('session/:sessionId')
  @ApiOperation({ summary: '获取会话的所有发言记录' })
  @ApiResponse({ status: 200, type: [SpeechDto] })
  async findBySession(@Param('sessionId') sessionId: string): Promise<SpeechDto[]> {
    return this.speechService.findBySession(sessionId)
  }

  /**
   * 获取发言者的所有发言记录 - 公开访问
   * TODO: 正式版本需添加认证和会话归属校验
   */
  @Public()
  @Get('session/:sessionId/speaker/:speakerId')
  @ApiOperation({ summary: '获取发言者的所有发言记录' })
  @ApiResponse({ status: 200, type: [SpeechDto] })
  async findBySpeaker(
    @Param('sessionId') sessionId: string,
    @Param('speakerId') speakerId: string
  ): Promise<SpeechDto[]> {
    return this.speechService.findBySpeaker(sessionId, speakerId)
  }

  /**
   * 搜索发言记录 - 公开访问
   * TODO: 正式版本需添加认证和会话归属校验
   */
  @Public()
  @Get('session/:sessionId/search')
  @ApiOperation({ summary: '搜索发言记录' })
  @ApiResponse({ status: 200, type: [SpeechDto] })
  async search(
    @Param('sessionId') sessionId: string,
    @Query('keyword') keyword: string
  ): Promise<SpeechDto[]> {
    return this.speechService.search(sessionId, keyword)
  }

  /**
   * 更新发言记录 - 需要认证
   * 防止未授权用户修改发言内容
   */
  @Put(':id')
  @ApiOperation({ summary: '更新发言记录 (B1029)' })
  @ApiResponse({ status: 200, type: SpeechDto })
  async update(@Param('id') id: string, @Body() dto: UpdateSpeechDto): Promise<SpeechDto> {
    return this.speechService.update(id, dto)
  }

  /**
   * 标记/取消标记发言记录 - 需要认证
   * 防止未授权用户修改标记状态
   */
  @Put(':id/mark')
  @ApiOperation({ summary: '标记/取消标记发言记录' })
  @ApiResponse({ status: 200, type: SpeechDto })
  async toggleMark(
    @Param('id') id: string,
    @Body() body: { marked: boolean; reason?: string }
  ): Promise<SpeechDto> {
    return this.speechService.toggleMark(id, body.marked, body.reason)
  }

  /**
   * 获取单条发言详情 - 公开访问
   * 注意：必须放在更具体的 GET 路由之后，避免误匹配（例如把 "session" 当作 id）
   * TODO: 正式版本需添加认证
   */
  @Public()
  @Get(':id')
  @ApiOperation({ summary: '获取发言详情' })
  @ApiResponse({ status: 200, type: SpeechDto })
  async findOne(@Param('id') id: string): Promise<SpeechDto> {
    return this.speechService.findOne(id)
  }

  /**
   * 删除会话的所有发言记录 - 需要认证
   * 危险操作，必须验证权限
   */
  @Delete('session/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除会话的所有发言记录' })
  @ApiResponse({ status: 204 })
  async deleteBySession(@Param('sessionId') sessionId: string): Promise<void> {
    return this.speechService.deleteBySession(sessionId)
  }
}
