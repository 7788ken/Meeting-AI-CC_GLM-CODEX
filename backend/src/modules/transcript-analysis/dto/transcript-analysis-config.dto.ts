import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class TranscriptAnalysisConfigDto {
  @ApiProperty({ description: '会议总结系统提示词' })
  summarySystemPrompt: string

  @ApiProperty({ description: '分片总结系统提示词' })
  chunkSummarySystemPrompt: string

  @ApiProperty({ description: '针对性分析系统提示词' })
  segmentAnalysisSystemPrompt: string
}

export class UpdateTranscriptAnalysisConfigDto {
  @ApiPropertyOptional({ description: '会议总结系统提示词' })
  @IsOptional()
  @IsString()
  summarySystemPrompt?: string

  @ApiPropertyOptional({ description: '分片总结系统提示词' })
  @IsOptional()
  @IsString()
  chunkSummarySystemPrompt?: string

  @ApiPropertyOptional({ description: '针对性分析系统提示词' })
  @IsOptional()
  @IsString()
  segmentAnalysisSystemPrompt?: string
}
