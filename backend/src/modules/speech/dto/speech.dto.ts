import { IsString, IsOptional, IsDateString, IsNumber } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateSpeechDto {
  @ApiProperty({ description: '会话ID' })
  @IsString()
  sessionId: string

  @ApiProperty({ description: '发言者ID' })
  @IsString()
  speakerId: string

  @ApiProperty({ description: '发言者名称' })
  @IsString()
  speakerName: string

  @ApiProperty({ description: '发言内容' })
  @IsString()
  content: string

  @ApiPropertyOptional({ description: '转写置信度' })
  @IsOptional()
  @IsNumber()
  confidence?: number
}

export class UpdateSpeechDto {
  @ApiPropertyOptional({ description: '发言内容' })
  @IsOptional()
  @IsString()
  content?: string

  @ApiPropertyOptional({ description: '是否被编辑' })
  @IsOptional()
  isEdited?: boolean

  @ApiPropertyOptional({ description: '是否被标记' })
  @IsOptional()
  isMarked?: boolean
}

export class SpeechDto {
  @ApiProperty({ description: '发言ID' })
  id: string

  @ApiProperty({ description: '会话ID' })
  sessionId: string

  @ApiProperty({ description: '发言者ID' })
  speakerId: string

  @ApiProperty({ description: '发言者名称' })
  speakerName: string

  @ApiProperty({ description: '发言内容' })
  content: string

  @ApiProperty({ description: '开始时间' })
  startTime: Date

  @ApiProperty({ description: '结束时间' })
  endTime: Date

  @ApiProperty({ description: '时长（秒）' })
  duration: number

  @ApiProperty({ description: '转写置信度' })
  confidence: number

  @ApiProperty({ description: '是否被编辑' })
  isEdited: boolean

  @ApiProperty({ description: '是否被标记' })
  isMarked: boolean
}
