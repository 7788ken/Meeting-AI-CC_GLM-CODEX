import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { AppConfigService } from './app-config.service'
import { GlmRateLimiter } from '../../common/llm/glm-rate-limiter'
import {
  APP_CONFIG_FIELDS,
  APP_CONFIG_REMARKS,
  APP_CONFIG_SEED_KEYS,
  type AppConfigFieldConfig,
} from './app-config.constants'
import { AppConfigQueueStatsDto } from './dto/app-config-queue-stats.dto'
import { AppConfigDto, UpdateAppConfigDto } from './dto/app-config.dto'
import {
  AppConfigSecurityStatusDto,
  AppConfigSecurityUpdateResponseDto,
  AppConfigSecurityVerifyResponseDto,
  UpdateAppConfigSecurityPasswordDto,
  VerifyAppConfigSecurityDto,
} from './dto/app-config-security.dto'
import { AppConfigRemarkDto } from './dto/app-config-remark.dto'
import { SettingsPasswordGuard } from './guards/settings-password.guard'

@ApiTags('app-config')
@Controller('app-config')
export class AppConfigController {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly glmRateLimiter: GlmRateLimiter
  ) {}

  @Public()
  @Get()
  @UseGuards(SettingsPasswordGuard)
  @ApiOperation({ summary: '获取后端服务配置' })
  @ApiResponse({ status: 200, type: AppConfigDto })
  async getConfig(): Promise<AppConfigDto> {
    return this.buildConfigDto()
  }

  @Public()
  @Put()
  @UseGuards(SettingsPasswordGuard)
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

  @Public()
  @Get('security/status')
  @ApiOperation({ summary: '获取系统安全密码状态' })
  @ApiResponse({ status: 200, type: AppConfigSecurityStatusDto })
  async getSecurityStatus(): Promise<AppConfigSecurityStatusDto> {
    return { enabled: this.appConfigService.isSecurityPasswordSet() }
  }

  @Public()
  @Post('security/verify')
  @ApiOperation({ summary: '校验系统安全密码' })
  @ApiResponse({ status: 200, type: AppConfigSecurityVerifyResponseDto })
  async verifySecurityPassword(
    @Body() dto: VerifyAppConfigSecurityDto
  ): Promise<AppConfigSecurityVerifyResponseDto> {
    const password = dto.password?.trim()
    if (!password) {
      throw new BadRequestException('password is required')
    }
    if (this.appConfigService.isSecurityPasswordSet()) {
      const verified = await this.appConfigService.verifySecurityPassword(password)
      if (!verified) {
        throw new UnauthorizedException('Settings password incorrect')
      }
    }
    return { verified: true }
  }

  @Public()
  @Put('security/password')
  @ApiOperation({ summary: '设置或更新系统安全密码' })
  @ApiResponse({ status: 200, type: AppConfigSecurityUpdateResponseDto })
  async updateSecurityPassword(
    @Body() dto: UpdateAppConfigSecurityPasswordDto
  ): Promise<AppConfigSecurityUpdateResponseDto> {
    const password = dto.password?.trim()
    if (!password) {
      throw new BadRequestException('password is required')
    }
    if (this.appConfigService.isSecurityPasswordSet()) {
      const currentPassword = dto.currentPassword?.trim()
      if (!currentPassword) {
        throw new BadRequestException('currentPassword is required')
      }
      const verified = await this.appConfigService.verifySecurityPassword(currentPassword)
      if (!verified) {
        throw new UnauthorizedException('Settings password incorrect')
      }
    }
    await this.appConfigService.setSecurityPassword(password)
    return { updated: true }
  }

  @Public()
  @Get('remarks')
  @UseGuards(SettingsPasswordGuard)
  @ApiOperation({ summary: '获取配置备注说明' })
  @ApiResponse({ status: 200, type: AppConfigRemarkDto, isArray: true })
  async getRemarks(): Promise<AppConfigRemarkDto[]> {
    const dbRemarks = await this.appConfigService.getRemarks(APP_CONFIG_SEED_KEYS)
    return APP_CONFIG_SEED_KEYS.map(key => {
      const dbRemark = (dbRemarks[key] ?? '').trim()
      return {
        key,
        remark: dbRemark ? dbRemark : APP_CONFIG_REMARKS[key],
      }
    })
  }

  @Public()
  @Get('queue-stats')
  @ApiOperation({ summary: '获取 AI 队列统计' })
  @ApiResponse({ status: 200, type: AppConfigQueueStatsDto })
  async getQueueStats(): Promise<AppConfigQueueStatsDto> {
    return this.glmRateLimiter.getQueueStats()
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
      if (field.key === 'GLM_TRANSCRIPT_SEGMENT_ANALYSIS_THINKING') {
        const summaryThinking = this.appConfigService.getBoolean(
          'GLM_TRANSCRIPT_SUMMARY_THINKING',
          true
        )
        return this.appConfigService.getBoolean(field.key, summaryThinking)
      }
      return this.appConfigService.getBoolean(field.key, Boolean(field.defaultValue))
    }
    if (field.type === 'number') {
      const validator =
        field.min != null && field.max != null
          ? (value: number) => value >= field.min! && value <= field.max!
          : undefined
      return this.appConfigService.getNumber(field.key, Number(field.defaultValue), validator)
    }
    return this.appConfigService.getString(field.key, String(field.defaultValue))
  }
}
