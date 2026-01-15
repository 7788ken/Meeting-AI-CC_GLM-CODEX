import { Body, Controller, Get, Put } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { AppConfigService } from './app-config.service'
import { APP_CONFIG_FIELDS, type AppConfigFieldConfig } from './app-config.constants'
import { AppConfigDto, UpdateAppConfigDto } from './dto/app-config.dto'

@ApiTags('app-config')
@Controller('app-config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '获取后端服务配置' })
  @ApiResponse({ status: 200, type: AppConfigDto })
  async getConfig(): Promise<AppConfigDto> {
    return this.buildConfigDto()
  }

  @Public()
  @Put()
  @ApiOperation({ summary: '更新后端服务配置' })
  @ApiResponse({ status: 200, type: AppConfigDto })
  async updateConfig(@Body() dto: UpdateAppConfigDto): Promise<AppConfigDto> {
    const updates: Record<string, string> = {}
    for (const field of APP_CONFIG_FIELDS) {
      const value = Reflect.get(dto as object, field.field) as unknown
      if (value == null) continue
      if (field.type === 'boolean') {
        updates[field.key] = value ? '1' : '0'
        continue
      }
      if (field.type === 'string') {
        updates[field.key] = String(value).trim()
        continue
      }
      updates[field.key] = String(value)
    }
    await this.appConfigService.setMany(updates)
    return this.buildConfigDto()
  }

  private buildConfigDto(): AppConfigDto {
    const dto = new AppConfigDto()
    for (const field of APP_CONFIG_FIELDS) {
      Reflect.set(dto, field.field, this.resolveFieldValue(field))
    }
    return dto
  }

  private resolveFieldValue(field: AppConfigFieldConfig): string | number | boolean {
    if (field.type === 'boolean') {
      return this.appConfigService.getBoolean(field.key, Boolean(field.defaultValue))
    }
    if (field.type === 'number') {
      const validator =
        field.min != null && field.max != null
          ? (value: number) => value >= field.min! && value <= field.max!
          : undefined
      return this.appConfigService.getNumber(
        field.key,
        Number(field.defaultValue),
        validator
      )
    }
    return this.appConfigService.getString(field.key, String(field.defaultValue))
  }
}
