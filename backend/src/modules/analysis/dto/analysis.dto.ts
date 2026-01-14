import { IsString, IsArray, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class GenerateAnalysisDto {
  @ApiProperty({ description: '会话ID' })
  @IsString()
  sessionId: string

  @ApiProperty({ description: '发言ID列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  speechIds: string[]

  @ApiPropertyOptional({ description: '分析类型（可用于区分缓存）', default: 'summary' })
  @IsOptional()
  @IsString()
  analysisType?: string

  @ApiPropertyOptional({
    description: '提示词模板内容（可选）。支持 {{speeches}} 占位符，未包含时将自动追加发言文本。',
  })
  @IsOptional()
  @IsString()
  prompt?: string

  @ApiPropertyOptional({
    description: 'AI 模型',
    default: 'qianwen',
  })
  @IsOptional()
  @IsString()
  model?: string
}

export class AnalysisDto {
  @ApiProperty({ description: '分析ID' })
  id: string

  @ApiProperty({ description: '会话ID' })
  sessionId: string

  @ApiProperty({ description: '分析类型' })
  analysisType: string

  @ApiProperty({ description: '使用的AI模型' })
  modelUsed: string

  @ApiProperty({ description: '分析结果' })
  result: string

  @ApiProperty({ description: '状态' })
  status: string

  @ApiPropertyOptional({ description: '处理耗时(ms)' })
  processingTime?: number

  @ApiPropertyOptional({ description: '是否使用缓存' })
  isCached?: boolean

  @ApiPropertyOptional({ description: '生成时间' })
  generatedAt?: Date

  @ApiProperty({ description: '创建时间' })
  createdAt: Date
}
