import { IsString, IsArray, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { AIModel } from './analysis.enum'

export class GenerateAnalysisDto {
  @ApiProperty({ description: '发言ID列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  speechIds: string[]

  @ApiPropertyOptional({ description: 'AI模型', enum: AIModel })
  @IsOptional()
  @IsString()
  model?: AIModel

  @ApiPropertyOptional({ description: '分析类型' })
  @IsOptional()
  type?: 'core' | 'brief' | 'deep' | 'all'
}

export class AnalysisDto {
  @ApiProperty({ description: '分析ID' })
  id: string

  @ApiProperty({ description: '关联发言ID' })
  speechId: string

  @ApiProperty({ description: '会话ID' })
  sessionId: string

  @ApiProperty({ description: '核心要点分析' })
  coreAnalysis: string

  @ApiProperty({ description: '简要回答' })
  briefAnswer: string

  @ApiProperty({ description: '深度分析' })
  deepAnswer: string

  @ApiProperty({ description: '使用的AI模型' })
  modelUsed: string

  @ApiProperty({ description: '生成时间' })
  generatedAt: Date
}
