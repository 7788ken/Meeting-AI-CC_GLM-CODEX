import { IsString, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class TranscriptDataDto {
  @ApiProperty({ description: '会话ID' })
  sessionId: string

  @ApiProperty({ description: '音频数据（Base64）' })
  audioData: string

  @ApiPropertyOptional({ description: '是否结束' })
  isFinal?: boolean
}

export class TranscriptResultDto {
  @ApiProperty({ description: '转写ID' })
  id: string

  @ApiProperty({ description: '会话ID' })
  sessionId: string

  @ApiPropertyOptional({ description: '段落切分键（用于按 utterance 切段）' })
  segmentKey?: string

  @ApiProperty({ description: '发言者ID' })
  speakerId: string

  @ApiProperty({ description: '发言者名称' })
  speakerName: string

  @ApiProperty({ description: '转写内容' })
  content: string

  @ApiProperty({ description: '是否最终结果' })
  isFinal: boolean

  @ApiProperty({ description: '置信度' })
  confidence: number
}
