import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'
import { PROMPT_TEMPLATE_TYPES, type PromptTemplateType } from '../prompt-library.constants'

export class PromptTemplateDto {
  @ApiProperty({ description: '提示词 ID' })
  id: string

  @ApiProperty({ description: '提示词名称' })
  name: string

  @ApiPropertyOptional({ description: '提示词别名' })
  alias?: string

  @ApiProperty({ description: '提示词类型', enum: PROMPT_TEMPLATE_TYPES })
  type: PromptTemplateType

  @ApiProperty({ description: '提示词内容' })
  content: string

  @ApiProperty({ description: '是否为默认提示词' })
  isDefault: boolean

  @ApiProperty({ description: '创建时间' })
  createdAt: string

  @ApiProperty({ description: '更新时间' })
  updatedAt: string
}

export class CreatePromptTemplateDto {
  @ApiProperty({ description: '提示词名称' })
  @IsString()
  name: string

  @ApiPropertyOptional({ description: '提示词别名' })
  @IsOptional()
  @IsString()
  alias?: string

  @ApiProperty({ description: '提示词类型', enum: PROMPT_TEMPLATE_TYPES })
  @IsString()
  @IsIn(PROMPT_TEMPLATE_TYPES)
  type: PromptTemplateType

  @ApiProperty({ description: '提示词内容' })
  @IsString()
  content: string

  @ApiPropertyOptional({ description: '是否设为默认提示词' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}

export class UpdatePromptTemplateDto {
  @ApiPropertyOptional({ description: '提示词名称' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: '提示词别名' })
  @IsOptional()
  @IsString()
  alias?: string

  @ApiPropertyOptional({ description: '提示词内容' })
  @IsOptional()
  @IsString()
  content?: string

  @ApiPropertyOptional({ description: '是否设为默认提示词' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}
