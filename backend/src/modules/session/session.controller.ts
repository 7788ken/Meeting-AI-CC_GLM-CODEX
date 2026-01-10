import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common'
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
  @ApiOperation({ summary: '结束会话' })
  @ApiResponse({ status: 200, type: SessionDto })
  async end(@Param('id') id: string): Promise<SessionDto> {
    return this.sessionService.end(id)
  }

  @Public()
  @Get()
  @ApiOperation({ summary: '获取所有会话' })
  @ApiResponse({ status: 200, type: [SessionDto] })
  async findAll(): Promise<SessionDto[]> {
    return this.sessionService.findAll()
  }
}
