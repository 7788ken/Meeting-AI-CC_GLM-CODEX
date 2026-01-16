import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { SettingsPasswordGuard } from '../app-config/guards/settings-password.guard'
import {
  CreatePromptTemplateDto,
  PromptTemplateDto,
  UpdatePromptTemplateDto,
} from './dto/prompt-template.dto'
import { PromptLibraryService } from './prompt-library.service'

@ApiTags('prompt-library')
@Controller('prompt-library')
export class PromptLibraryController {
  constructor(private readonly promptLibraryService: PromptLibraryService) {}

  @Public()
  @Get()
  @UseGuards(SettingsPasswordGuard)
  @ApiOperation({ summary: '获取提示词库' })
  @ApiResponse({ status: 200, type: [PromptTemplateDto] })
  list(): PromptTemplateDto[] {
    return this.promptLibraryService.list()
  }

  @Public()
  @Post()
  @UseGuards(SettingsPasswordGuard)
  @ApiOperation({ summary: '创建提示词' })
  @ApiResponse({ status: 200, type: PromptTemplateDto })
  async create(@Body() dto: CreatePromptTemplateDto): Promise<PromptTemplateDto> {
    return this.promptLibraryService.create(dto)
  }

  @Public()
  @Put(':id')
  @UseGuards(SettingsPasswordGuard)
  @ApiOperation({ summary: '更新提示词' })
  @ApiResponse({ status: 200, type: PromptTemplateDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePromptTemplateDto
  ): Promise<PromptTemplateDto> {
    return this.promptLibraryService.update(id, dto)
  }

  @Public()
  @Delete(':id')
  @UseGuards(SettingsPasswordGuard)
  @ApiOperation({ summary: '删除提示词' })
  @ApiResponse({ status: 200 })
  async remove(@Param('id') id: string): Promise<{ id: string }> {
    await this.promptLibraryService.remove(id)
    return { id }
  }
}
