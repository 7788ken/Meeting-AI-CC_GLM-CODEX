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

  @ApiProperty({ description: 'GLM ASR 并发上限', minimum: 1, maximum: 50 })
  glmAsrConcurrency: number

  @ApiProperty({ description: 'GLM ASR 启动请求最小间隔（ms）', minimum: 0, maximum: 60000 })
  glmAsrMinIntervalMs: number

  @ApiProperty({ description: 'GLM ASR 冷却时间（ms）', minimum: 0, maximum: 120000 })
  glmAsrRateLimitCooldownMs: number

  @ApiProperty({ description: 'GLM ASR 冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  glmAsrRateLimitMaxMs: number

  @ApiProperty({ description: '语句拆分并发上限', minimum: 1, maximum: 50 })
  glmTranscriptEventSegmentConcurrency: number

  @ApiProperty({ description: '语句重建拆分并发上限', minimum: 1, maximum: 50 })
  glmTranscriptEventSegmentRebuildConcurrency: number

  @ApiProperty({ description: '语句拆分启动请求最小间隔（ms）', minimum: 0, maximum: 60000 })
  glmTranscriptEventSegmentMinIntervalMs: number

  @ApiProperty({ description: '语句重建拆分启动请求最小间隔（ms）', minimum: 0, maximum: 60000 })
  glmTranscriptEventSegmentRebuildMinIntervalMs: number

  @ApiProperty({ description: '语句拆分冷却时间（ms）', minimum: 0, maximum: 120000 })
  glmTranscriptEventSegmentRateLimitCooldownMs: number

  @ApiProperty({ description: '语句重建拆分冷却时间（ms）', minimum: 0, maximum: 120000 })
  glmTranscriptEventSegmentRebuildRateLimitCooldownMs: number

  @ApiProperty({ description: '语句拆分冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  glmTranscriptEventSegmentRateLimitMaxMs: number

  @ApiProperty({ description: '语句重建拆分冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  glmTranscriptEventSegmentRebuildRateLimitMaxMs: number

  @ApiProperty({ description: '语句翻译并发上限', minimum: 1, maximum: 50 })
  glmTranscriptEventSegmentTranslationConcurrency: number

  @ApiProperty({ description: '语句翻译启动请求最小间隔（ms）', minimum: 0, maximum: 60000 })
  glmTranscriptEventSegmentTranslationMinIntervalMs: number

  @ApiProperty({ description: '语句翻译冷却时间（ms）', minimum: 0, maximum: 120000 })
  glmTranscriptEventSegmentTranslationRateLimitCooldownMs: number

  @ApiProperty({ description: '语句翻译冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  glmTranscriptEventSegmentTranslationRateLimitMaxMs: number

  @ApiProperty({ description: 'AI 分析并发上限', minimum: 1, maximum: 50 })
  glmTranscriptAnalysisConcurrency: number

  @ApiProperty({ description: 'AI 分析启动请求最小间隔（ms）', minimum: 0, maximum: 60000 })
  glmTranscriptAnalysisMinIntervalMs: number

  @ApiProperty({ description: 'AI 分析冷却时间（ms）', minimum: 0, maximum: 120000 })
  glmTranscriptAnalysisRateLimitCooldownMs: number

  @ApiProperty({ description: 'AI 分析冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  glmTranscriptAnalysisRateLimitMaxMs: number

  @ApiProperty({ description: '语句拆分全局并发上限', minimum: 1, maximum: 50 })
  transcriptEventsSegmentMaxInFlight: number

  @ApiProperty({ description: '语句拆分待处理会话上限', minimum: 1, maximum: 5000 })
  transcriptEventsSegmentMaxPendingSessions: number

  @ApiProperty({ description: '语句拆分待处理最大滞留时间（ms）', minimum: 1000, maximum: 300000 })
  transcriptEventsSegmentMaxStalenessMs: number

  @ApiProperty({ description: '转写自动切分间隔（ms）', minimum: 0, maximum: 600000 })
  transcriptAutoSplitGapMs: number

  @ApiProperty({ description: '音频 buffer 软上限（ms）', minimum: 5000, maximum: 59000 })
  transcriptMaxBufferDurationSoftMs: number

  @ApiProperty({ description: '音频 buffer 硬上限（ms）', minimum: 5000, maximum: 59000 })
  transcriptMaxBufferDurationHardMs: number

  @ApiProperty({ description: '转写调试：打印语句日志' })
  transcriptDebugLogUtterances: boolean

  @ApiProperty({ description: '日志记录：请求与回复' })
  appLogRequestResponseEnabled: boolean

  @ApiProperty({ description: '日志记录：错误日志' })
  appLogErrorEnabled: boolean

  @ApiProperty({ description: '日志记录：系统日志' })
  appLogSystemEnabled: boolean

  @ApiProperty({ description: '语句翻译：是否启用语句拆分后翻译' })
  transcriptSegmentTranslationEnabled: boolean

  @ApiProperty({ description: '语句翻译目标语言' })
  transcriptSegmentTranslationLanguage: string

  @ApiProperty({ description: '语句翻译模型（可选）' })
  glmTranscriptSegmentTranslationModel: string

  @ApiProperty({ description: 'AI 分析：是否强制输出指定语言' })
  transcriptAnalysisLanguageEnabled: boolean

  @ApiProperty({ description: 'AI 分析输出目标语言' })
  transcriptAnalysisLanguage: string

  @ApiProperty({ description: '会议总结模型' })
  glmTranscriptSummaryModel: string

  @ApiProperty({ description: '会议总结最大 tokens', minimum: 256, maximum: 8192 })
  glmTranscriptSummaryMaxTokens: number

  @ApiProperty({ description: '会议总结是否启用深度思考' })
  glmTranscriptSummaryThinking: boolean

  @ApiProperty({ description: '针对性分析是否启用深度思考' })
  glmTranscriptSegmentAnalysisThinking: boolean

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

  @ApiPropertyOptional({ description: 'GLM ASR 并发上限', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  glmAsrConcurrency?: number

  @ApiPropertyOptional({
    description: 'GLM ASR 启动请求最小间隔（ms）',
    minimum: 0,
    maximum: 60000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  glmAsrMinIntervalMs?: number

  @ApiPropertyOptional({ description: 'GLM ASR 冷却时间（ms）', minimum: 0, maximum: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  glmAsrRateLimitCooldownMs?: number

  @ApiPropertyOptional({ description: 'GLM ASR 冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300000)
  glmAsrRateLimitMaxMs?: number

  @ApiPropertyOptional({ description: '语句拆分并发上限', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  glmTranscriptEventSegmentConcurrency?: number

  @ApiPropertyOptional({ description: '语句重建拆分并发上限', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  glmTranscriptEventSegmentRebuildConcurrency?: number

  @ApiPropertyOptional({
    description: '语句拆分启动请求最小间隔（ms）',
    minimum: 0,
    maximum: 60000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  glmTranscriptEventSegmentMinIntervalMs?: number

  @ApiPropertyOptional({
    description: '语句重建拆分启动请求最小间隔（ms）',
    minimum: 0,
    maximum: 60000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  glmTranscriptEventSegmentRebuildMinIntervalMs?: number

  @ApiPropertyOptional({ description: '语句拆分冷却时间（ms）', minimum: 0, maximum: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  glmTranscriptEventSegmentRateLimitCooldownMs?: number

  @ApiPropertyOptional({ description: '语句重建拆分冷却时间（ms）', minimum: 0, maximum: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  glmTranscriptEventSegmentRebuildRateLimitCooldownMs?: number

  @ApiPropertyOptional({ description: '语句拆分冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300000)
  glmTranscriptEventSegmentRateLimitMaxMs?: number

  @ApiPropertyOptional({
    description: '语句重建拆分冷却时间上限（ms）',
    minimum: 0,
    maximum: 300000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300000)
  glmTranscriptEventSegmentRebuildRateLimitMaxMs?: number

  @ApiPropertyOptional({ description: '语句翻译并发上限', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  glmTranscriptEventSegmentTranslationConcurrency?: number

  @ApiPropertyOptional({
    description: '语句翻译启动请求最小间隔（ms）',
    minimum: 0,
    maximum: 60000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  glmTranscriptEventSegmentTranslationMinIntervalMs?: number

  @ApiPropertyOptional({ description: '语句翻译冷却时间（ms）', minimum: 0, maximum: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  glmTranscriptEventSegmentTranslationRateLimitCooldownMs?: number

  @ApiPropertyOptional({ description: '语句翻译冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300000)
  glmTranscriptEventSegmentTranslationRateLimitMaxMs?: number

  @ApiPropertyOptional({ description: 'AI 分析并发上限', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  glmTranscriptAnalysisConcurrency?: number

  @ApiPropertyOptional({ description: 'AI 分析启动请求最小间隔（ms）', minimum: 0, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  glmTranscriptAnalysisMinIntervalMs?: number

  @ApiPropertyOptional({ description: 'AI 分析冷却时间（ms）', minimum: 0, maximum: 120000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  glmTranscriptAnalysisRateLimitCooldownMs?: number

  @ApiPropertyOptional({ description: 'AI 分析冷却时间上限（ms）', minimum: 0, maximum: 300000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300000)
  glmTranscriptAnalysisRateLimitMaxMs?: number

  @ApiPropertyOptional({ description: '语句拆分全局并发上限', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  transcriptEventsSegmentMaxInFlight?: number

  @ApiPropertyOptional({ description: '语句拆分待处理会话上限', minimum: 1, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  transcriptEventsSegmentMaxPendingSessions?: number

  @ApiPropertyOptional({
    description: '语句拆分待处理最大滞留时间（ms）',
    minimum: 1000,
    maximum: 300000,
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300000)
  transcriptEventsSegmentMaxStalenessMs?: number

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

  @ApiPropertyOptional({ description: '日志记录：请求与回复' })
  @IsOptional()
  @IsBoolean()
  appLogRequestResponseEnabled?: boolean

  @ApiPropertyOptional({ description: '日志记录：错误日志' })
  @IsOptional()
  @IsBoolean()
  appLogErrorEnabled?: boolean

  @ApiPropertyOptional({ description: '日志记录：系统日志' })
  @IsOptional()
  @IsBoolean()
  appLogSystemEnabled?: boolean

  @ApiPropertyOptional({ description: '语句翻译：是否启用语句拆分后翻译' })
  @IsOptional()
  @IsBoolean()
  transcriptSegmentTranslationEnabled?: boolean

  @ApiPropertyOptional({ description: '语句翻译目标语言' })
  @IsOptional()
  @IsString()
  transcriptSegmentTranslationLanguage?: string

  @ApiPropertyOptional({ description: '语句翻译模型（可选）' })
  @IsOptional()
  @IsString()
  glmTranscriptSegmentTranslationModel?: string

  @ApiPropertyOptional({ description: 'AI 分析：是否强制输出指定语言' })
  @IsOptional()
  @IsBoolean()
  transcriptAnalysisLanguageEnabled?: boolean

  @ApiPropertyOptional({ description: 'AI 分析输出目标语言' })
  @IsOptional()
  @IsString()
  transcriptAnalysisLanguage?: string

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

  @ApiPropertyOptional({ description: '针对性分析是否启用深度思考' })
  @IsOptional()
  @IsBoolean()
  glmTranscriptSegmentAnalysisThinking?: boolean

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
