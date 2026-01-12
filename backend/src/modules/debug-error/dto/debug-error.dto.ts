import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class DebugErrorDto {
  @ApiProperty({ description: '错误ID' })
  id: string

  @ApiProperty({ description: '会话ID' })
  sessionId: string

  @ApiProperty({ description: '错误级别', enum: ['info', 'warn', 'error', 'fatal'] })
  level: string

  @ApiProperty({ description: '错误信息' })
  message: string

  @ApiPropertyOptional({ description: '错误来源' })
  source?: string

  @ApiPropertyOptional({ description: '错误分类' })
  category?: string

  @ApiPropertyOptional({ description: '错误码' })
  errorCode?: string

  @ApiPropertyOptional({ description: '堆栈信息' })
  stack?: string

  @ApiPropertyOptional({ description: '错误上下文' })
  context?: Record<string, unknown>

  @ApiPropertyOptional({ description: '发生时间' })
  occurredAt?: Date

  @ApiProperty({ description: '创建时间' })
  createdAt: Date
}
