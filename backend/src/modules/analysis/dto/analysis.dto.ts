import { IsString, IsArray, IsOptional, IsEnum } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { AnalysisType } from './analysis.enum'

export class GenerateAnalysisDto {
  @ApiProperty({ description: '会话ID' })
  @IsString()
  sessionId: string

  @ApiProperty({ description: '发言ID列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  speechIds: string[]

  @ApiPropertyOptional({
    description: '分析类型',
    enum: AnalysisType,
    default: AnalysisType.SUMMARY,
  })
  @IsOptional()
  @IsEnum(AnalysisType)
  analysisType?: AnalysisType
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
