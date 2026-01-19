import { IsOptional, IsDateString } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateSessionDto {
  @ApiProperty({ description: '会话设置（可选）' })
  @IsOptional()
  settings?: Record<string, unknown>
}

export class UpdateSessionDto {
  @ApiPropertyOptional({ description: '会话结束时间' })
  @IsOptional()
  @IsDateString()
  endedAt?: string

  @ApiPropertyOptional({ description: '会话时长（秒）' })
  @IsOptional()
  duration?: number
}

export class SessionDto {
  @ApiProperty({ description: '会话ID' })
  id: string

  @ApiPropertyOptional({ description: '会话标题' })
  title?: string

  @ApiPropertyOptional({ description: '会话描述' })
  description?: string

  @ApiProperty({ description: '会话开始时间' })
  startedAt: Date

  @ApiProperty({ description: '会话结束时间', required: false })
  endedAt: Date | null

  @ApiProperty({ description: '会话时长（秒）', required: false })
  duration: number | null

  @ApiProperty({ description: '是否活跃' })
  isActive: boolean

  @ApiProperty({ description: '是否已存档' })
  isArchived: boolean

  @ApiPropertyOptional({ description: '最近请求时间', required: false })
  lastRequestAt?: Date | null

  @ApiPropertyOptional({ description: '是否录音中', required: false })
  isRecording?: boolean
}
