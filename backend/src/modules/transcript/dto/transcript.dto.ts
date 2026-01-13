import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class TranscriptDataDto {
  @ApiProperty({ description: '会话ID' })
  sessionId: string

  @ApiProperty({ description: '音频数据（Base64）' })
  audioData: string

  @ApiPropertyOptional({ description: '是否结束' })
  isFinal?: boolean
}

export class AsrConfigDto {
  @ApiPropertyOptional({
    description: '音频累积时长（ms）',
    default: 3000,
    minimum: 1000,
    maximum: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(10000)
  bufferDurationMs?: number

  @ApiPropertyOptional({ description: '最小音频长度（ms）', default: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minAudioLengthMs?: number

  @ApiPropertyOptional({
    description: '语言',
    default: 'zh',
    enum: ['zh', 'en', 'yue', 'auto'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['zh', 'en', 'yue', 'auto'])
  language?: string

  @ApiPropertyOptional({ description: '热词', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hotwords?: string[]

  @ApiPropertyOptional({ description: '上下文提示' })
  @IsOptional()
  @IsString()
  prompt?: string
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
