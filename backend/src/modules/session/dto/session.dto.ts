import { IsString, IsOptional, IsDateString } from 'class-validator'
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

  @ApiProperty({ description: '会话开始时间' })
  startedAt: Date

  @ApiProperty({ description: '会话结束时间', required: false })
  endedAt: Date | null

  @ApiProperty({ description: '会话时长（秒）', required: false })
  duration: number | null

  @ApiProperty({ description: '是否活跃' })
  isActive: boolean
}
