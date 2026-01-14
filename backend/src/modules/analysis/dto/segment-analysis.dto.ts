import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString } from 'class-validator'

export class StreamSegmentAnalysisDto {
  @ApiProperty({ description: '会话ID' })
  @IsString()
  sessionId: string

  @ApiProperty({ description: '语句拆分片段内容' })
  @IsString()
  content: string

  @ApiPropertyOptional({ description: '片段ID（可选，仅用于前端展示/定位）' })
  @IsOptional()
  @IsString()
  segmentId?: string

  @ApiPropertyOptional({ description: '片段序号（可选，仅用于前端展示）' })
  @IsOptional()
  @IsNumber()
  sequence?: number

  @ApiPropertyOptional({
    description:
      '提示词模板内容（可选）。支持 {{speeches}}/{{segment}}/{{content}} 占位符，未包含时将自动追加片段文本。',
  })
  @IsOptional()
  @IsString()
  prompt?: string

  @ApiPropertyOptional({ description: '分析类型（可用于前端区分展示）' })
  @IsOptional()
  @IsString()
  analysisType?: string
}

