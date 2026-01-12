import { Controller, Get, Param } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { DebugErrorService } from './debug-error.service'
import { DebugErrorDto } from './dto/debug-error.dto'
import { Public } from '../auth/decorators/public.decorator'

/**
 * 会话调试错误控制器
 */
@ApiTags('debug-errors')
@Controller('debug-errors')
export class DebugErrorController {
  constructor(private readonly debugErrorService: DebugErrorService) {}

  /**
   * 获取会话的调试错误列表
   */
  @Public()
  @Get('session/:sessionId')
  @ApiOperation({ summary: '获取会话的调试错误列表' })
  @ApiResponse({ status: 200, type: [DebugErrorDto] })
  async findBySession(@Param('sessionId') sessionId: string): Promise<DebugErrorDto[]> {
    return this.debugErrorService.findBySession(sessionId)
  }
}
