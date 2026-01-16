import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class TranscriptAnalysisConfigDto {
  @ApiProperty({ description: '会议总结提示词 ID' })
  summaryPromptId: string

  @ApiProperty({ description: '分片总结提示词 ID' })
  chunkSummaryPromptId: string

  @ApiProperty({ description: '针对性分析系统提示词' })
  segmentAnalysisSystemPrompt: string
}

export class UpdateTranscriptAnalysisConfigDto {
  @ApiPropertyOptional({ description: '会议总结提示词 ID' })
  @IsOptional()
  @IsString()
  summaryPromptId?: string

  @ApiPropertyOptional({ description: '分片总结提示词 ID' })
  @IsOptional()
  @IsString()
  chunkSummaryPromptId?: string

  @ApiPropertyOptional({ description: '针对性分析系统提示词' })
  @IsOptional()
  @IsString()
  segmentAnalysisSystemPrompt?: string
}
