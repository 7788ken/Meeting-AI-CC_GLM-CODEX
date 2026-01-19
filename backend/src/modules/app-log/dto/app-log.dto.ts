import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class AppLogDto {
  @ApiProperty({ description: '日志 ID' })
  id: string

  @ApiPropertyOptional({ description: '会话 ID' })
  sessionId?: string

  @ApiProperty({ description: '日志类型（request_response/error/system/llm）' })
  type: string

  @ApiProperty({ description: '日志级别（info/warn/error）' })
  level: string

  @ApiProperty({ description: '日志摘要' })
  message: string

  @ApiPropertyOptional({ description: '日志详情' })
  payload?: Record<string, unknown>

  @ApiProperty({ description: '记录时间' })
  createdAt: Date
}
