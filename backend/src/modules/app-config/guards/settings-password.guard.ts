import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AppConfigService } from '../app-config.service'

const SETTINGS_PASSWORD_HEADER = 'x-settings-password'

@Injectable()
export class SettingsPasswordGuard implements CanActivate {
  constructor(private readonly appConfigService: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.appConfigService.isSecurityPasswordSet()) {
      return true
    }

    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>
    }>()
    const raw = request?.headers?.[SETTINGS_PASSWORD_HEADER]
    const password = Array.isArray(raw) ? raw[0] : raw
    const normalized = String(password ?? '').trim()
    if (!normalized) {
      throw new UnauthorizedException('Settings password required')
    }

    const isValid = await this.appConfigService.verifySecurityPassword(normalized)
    if (!isValid) {
      throw new UnauthorizedException('Settings password incorrect')
    }
    return true
  }
}
