import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus, Delete } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { SessionService } from './session.service'
import { CreateSessionDto, SessionDto } from './dto/session.dto'
import { Public } from '../auth/decorators/public.decorator'

@ApiTags('sessions')
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建新会话' })
  @ApiResponse({ status: 201, type: SessionDto })
  async create(@Body() dto: CreateSessionDto): Promise<SessionDto> {
    return this.sessionService.create(dto?.settings)
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '获取会话详情' })
  @ApiResponse({ status: 200, type: SessionDto })
  async findOne(@Param('id') id: string): Promise<SessionDto> {
    return this.sessionService.findOne(id)
  }

  @Public()
  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '结束会话' })
  @ApiResponse({ status: 200, type: SessionDto })
  async end(@Param('id') id: string): Promise<SessionDto> {
    return this.sessionService.end(id)
  }

  @Public()
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '存档会话' })
  @ApiResponse({ status: 200, type: SessionDto })
  async archive(@Param('id') id: string): Promise<SessionDto> {
    return this.sessionService.archive(id)
  }

  @Public()
  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取消存档' })
  @ApiResponse({ status: 200, type: SessionDto })
  async unarchive(@Param('id') id: string): Promise<SessionDto> {
    return this.sessionService.unarchive(id)
  }

  @Public()
  @Get()
  @ApiOperation({ summary: '获取所有会话' })
  @ApiResponse({ status: 200, type: [SessionDto] })
  async findAll(): Promise<SessionDto[]> {
    return this.sessionService.findAll()
  }

  @Public()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除会话' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    await this.sessionService.remove(id)
  }
}
