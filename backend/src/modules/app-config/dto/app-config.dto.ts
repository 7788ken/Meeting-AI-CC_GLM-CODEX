import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class AppConfigDto {
  @ApiProperty({ description: 'GLM API Key' })
  glmApiKey: string

  @ApiProperty({ description: 'GLM Endpoint' })
  glmEndpoint: string

  @ApiProperty({ description: 'GLM 并发上限', minimum: 1, maximum: 50 })
  glmGlobalConcurrency: number

  @ApiProperty({ description: 'GLM 启动请求最小间隔（ms）', minimum: 0, maximum: 60000 })
  glmGlobalMinIntervalMs: number

  @ApiProperty({ description: 'GLM 冷却时间（ms）', minimum: 0, maximum: 120000 })
  glmGlobalRateLimitCooldownMs: number

  @ApiProperty({ description: 'GLM 冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  glmGlobalRateLimitMaxMs: number

  @ApiProperty({ description: '转写自动切分间隔（ms）', minimum: 0, maximum: 600000 })
  transcriptAutoSplitGapMs: number

  @ApiProperty({ description: '音频 buffer 软上限（ms）', minimum: 5000, maximum: 59000 })
  transcriptMaxBufferDurationSoftMs: number

  @ApiProperty({ description: '音频 buffer 硬上限（ms）', minimum: 5000, maximum: 59000 })
  transcriptMaxBufferDurationHardMs: number

  @ApiProperty({ description: '转写调试：打印语句日志' })
  transcriptDebugLogUtterances: boolean

  @ApiProperty({ description: '语句翻译：是否启用语句拆分后翻译' })
  transcriptSegmentTranslationEnabled: boolean

  @ApiProperty({ description: '会议总结模型' })
  glmTranscriptSummaryModel: string

  @ApiProperty({ description: '会议总结最大 tokens', minimum: 256, maximum: 8192 })
  glmTranscriptSummaryMaxTokens: number

  @ApiProperty({ description: '会议总结是否启用深度思考' })
  glmTranscriptSummaryThinking: boolean

  @ApiProperty({ description: '会议总结重试次数', minimum: 0, maximum: 10 })
  glmTranscriptSummaryRetryMax: number

  @ApiProperty({ description: '会议总结退避基准（ms）', minimum: 0, maximum: 60000 })
  glmTranscriptSummaryRetryBaseMs: number

  @ApiProperty({ description: '会议总结退避上限（ms）', minimum: 0, maximum: 120000 })
  glmTranscriptSummaryRetryMaxMs: number
}

export class UpdateAppConfigDto {
  @ApiPropertyOptional({ description: 'GLM API Key' })
  @IsOptional()
  @IsString()
  glmApiKey?: string

  @ApiPropertyOptional({ description: 'GLM Endpoint' })
  @IsOptional()
  @IsString()
  glmEndpoint?: string

  @ApiPropertyOptional({ description: 'GLM 并发上限', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  glmGlobalConcurrency?: number

  @ApiPropertyOptional({ description: 'GLM 启动请求最小间隔（ms）', minimum: 0, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  glmGlobalMinIntervalMs?: number

  @ApiPropertyOptional({ description: 'GLM 冷却时间（ms）', minimum: 0, maximum: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  glmGlobalRateLimitCooldownMs?: number

  @ApiPropertyOptional({ description: 'GLM 冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300000)
  glmGlobalRateLimitMaxMs?: number

  @ApiPropertyOptional({ description: '转写自动切分间隔（ms）', minimum: 0, maximum: 600000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600000)
  transcriptAutoSplitGapMs?: number

  @ApiPropertyOptional({ description: '音频 buffer 软上限（ms）', minimum: 5000, maximum: 59000 })
  @IsOptional()
  @IsInt()
  @Min(5000)
  @Max(59000)
  transcriptMaxBufferDurationSoftMs?: number

  @ApiPropertyOptional({ description: '音频 buffer 硬上限（ms）', minimum: 5000, maximum: 59000 })
  @IsOptional()
  @IsInt()
  @Min(5000)
  @Max(59000)
  transcriptMaxBufferDurationHardMs?: number

  @ApiPropertyOptional({ description: '转写调试：打印语句日志' })
  @IsOptional()
  @IsBoolean()
  transcriptDebugLogUtterances?: boolean

  @ApiPropertyOptional({ description: '语句翻译：是否启用语句拆分后翻译' })
  @IsOptional()
  @IsBoolean()
  transcriptSegmentTranslationEnabled?: boolean

  @ApiPropertyOptional({ description: '会议总结模型' })
  @IsOptional()
  @IsString()
  glmTranscriptSummaryModel?: string

  @ApiPropertyOptional({ description: '会议总结最大 tokens', minimum: 256, maximum: 8192 })
  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(8192)
  glmTranscriptSummaryMaxTokens?: number

  @ApiPropertyOptional({ description: '会议总结是否启用深度思考' })
  @IsOptional()
  @IsBoolean()
  glmTranscriptSummaryThinking?: boolean

  @ApiPropertyOptional({ description: '会议总结重试次数', minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  glmTranscriptSummaryRetryMax?: number

  @ApiPropertyOptional({ description: '会议总结退避基准（ms）', minimum: 0, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  glmTranscriptSummaryRetryBaseMs?: number

  @ApiPropertyOptional({ description: '会议总结退避上限（ms）', minimum: 0, maximum: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  glmTranscriptSummaryRetryMaxMs?: number
}
