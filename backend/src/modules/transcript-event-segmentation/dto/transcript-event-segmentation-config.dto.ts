import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class TranscriptEventSegmentationConfigDto {
  @ApiProperty({ description: '语句拆分系统提示词' })
  systemPrompt: string

  @ApiProperty({ description: '语句拆分严格回显提示词' })
  strictSystemPrompt: string

  @ApiProperty({ description: '上下文窗口事件数', minimum: 5, maximum: 2000 })
  windowEvents: number

  @ApiProperty({ description: '拆分触发间隔（毫秒）', minimum: 0, maximum: 600000 })
  intervalMs: number

  @ApiProperty({ description: '收到 stop_transcribe 立即触发拆分' })
  triggerOnStopTranscribe: boolean

  @ApiProperty({ description: '语句拆分模型' })
  model: string

  @ApiProperty({ description: 'GLM 输出上限 tokens', minimum: 256, maximum: 8192 })
  maxTokens: number

  @ApiProperty({ description: '是否启用 JSON 模式' })
  jsonMode: boolean

  @ApiProperty({
    description: '截断补偿 tokens（finish_reason=length 时提升上限）',
    minimum: 256,
    maximum: 8192,
  })
  bumpMaxTokens: number

  @ApiProperty({ description: 'GLM 429 最大重试次数', minimum: 0, maximum: 10 })
  retryMax: number

  @ApiProperty({ description: 'GLM 429 退避基准（ms）', minimum: 0, maximum: 60000 })
  retryBaseMs: number

  @ApiProperty({ description: 'GLM 429 退避上限（ms）', minimum: 0, maximum: 120000 })
  retryMaxMs: number

  @ApiProperty({ description: '严格 JSON 解析失败时是否降级为 extractedText（不调用/不解析）' })
  degradeOnStrictFail: boolean

  @ApiProperty({ description: '单次任务最多生成段数', minimum: 1, maximum: 100 })
  maxSegmentsPerRun: number
}

export class UpdateTranscriptEventSegmentationConfigDto {
  @ApiPropertyOptional({ description: '语句拆分系统提示词' })
  @IsOptional()
  @IsString()
  systemPrompt?: string

  @ApiPropertyOptional({ description: '语句拆分严格回显提示词' })
  @IsOptional()
  @IsString()
  strictSystemPrompt?: string

  @ApiPropertyOptional({ description: '上下文窗口事件数', minimum: 5, maximum: 2000 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(2000)
  windowEvents?: number

  @ApiPropertyOptional({ description: '拆分触发间隔（毫秒）', minimum: 0, maximum: 600000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600000)
  intervalMs?: number

  @ApiPropertyOptional({ description: '收到 stop_transcribe 立即触发拆分' })
  @IsOptional()
  @IsBoolean()
  triggerOnStopTranscribe?: boolean

  @ApiPropertyOptional({ description: '语句拆分模型' })
  @IsOptional()
  @IsString()
  model?: string

  @ApiPropertyOptional({ description: 'GLM 输出上限 tokens', minimum: 256, maximum: 8192 })
  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(8192)
  maxTokens?: number

  @ApiPropertyOptional({ description: '是否启用 JSON 模式' })
  @IsOptional()
  @IsBoolean()
  jsonMode?: boolean

  @ApiPropertyOptional({
    description: '截断补偿 tokens（finish_reason=length 时提升上限）',
    minimum: 256,
    maximum: 8192,
  })
  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(8192)
  bumpMaxTokens?: number

  @ApiPropertyOptional({ description: 'GLM 429 最大重试次数', minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retryMax?: number

  @ApiPropertyOptional({ description: 'GLM 429 退避基准（ms）', minimum: 0, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  retryBaseMs?: number

  @ApiPropertyOptional({ description: 'GLM 429 退避上限（ms）', minimum: 0, maximum: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  retryMaxMs?: number

  @ApiPropertyOptional({
    description: '严格 JSON 解析失败时是否降级为 extractedText（不调用/不解析）',
  })
  @IsOptional()
  @IsBoolean()
  degradeOnStrictFail?: boolean

  @ApiPropertyOptional({ description: '单次任务最多生成段数', minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxSegmentsPerRun?: number
}
