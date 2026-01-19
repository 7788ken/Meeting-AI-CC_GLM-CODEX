import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../database/prisma.service'
import {
  APP_CONFIG_REMARKS,
  APP_CONFIG_SEED_KEYS,
  APP_CONFIG_SECURITY_PASSWORD_KEY,
  type AppConfigSeedKey,
} from './app-config.constants'

@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name)
  private cache = new Map<string, string>()
  private refreshInFlight: Promise<void> | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedFromEnv(APP_CONFIG_SEED_KEYS)
    } catch (error) {
      this.logger.error(
        'Failed to seed app config from env',
        error instanceof Error ? error.stack : String(error)
      )
    }

    try {
      await this.refreshCache()
    } catch (error) {
      this.logger.error(
        'Failed to initialize app config cache',
        error instanceof Error ? error.stack : String(error)
      )
    }

    try {
      await this.ensureRemarks(APP_CONFIG_SEED_KEYS)
    } catch (error) {
      this.logger.error(
        'Failed to update app config remarks',
        error instanceof Error ? error.stack : String(error)
      )
    }
  }

  getString(key: string, fallback = ''): string {
    const raw = this.getRaw(key)
    if (raw == null) return fallback
    return String(raw)
  }

  getNumber(key: string, fallback: number, isValid?: (value: number) => boolean): number {
    const raw = this.getRaw(key)
    if (raw == null || raw === '') return fallback
    const value = Number(raw)
    if (!Number.isFinite(value)) return fallback
    if (isValid && !isValid(value)) return fallback
    return value
  }

  getBoolean(key: string, fallback: boolean): boolean {
    const raw = this.getRaw(key)
    if (raw == null || raw === '') return fallback
    const normalized = String(raw).trim().toLowerCase()
    if (normalized === '0' || normalized === 'false') return false
    if (normalized === '1' || normalized === 'true') return true
    return fallback
  }

  async setValue(key: string, value: string): Promise<void> {
    const normalized = value ?? ''
    const remark = this.getRemarkForKey(key)
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value: normalized, remark },
      update: { value: normalized },
    })
    this.cache.set(key, normalized)
  }

  async setMany(values: Record<string, string>): Promise<void> {
    const entries = Object.entries(values)
    if (!entries.length) return
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.appConfig.upsert({
          where: { key },
          create: { key, value: value ?? '', remark: this.getRemarkForKey(key) },
          update: { value: value ?? '' },
        })
      )
    )
    for (const [key, value] of entries) {
      this.cache.set(key, value ?? '')
    }
  }

  isSecurityPasswordSet(): boolean {
    return this.getSecurityPasswordHash().length > 0
  }

  async verifySecurityPassword(password: string): Promise<boolean> {
    const hash = this.getSecurityPasswordHash()
    if (!hash) return false
    return bcrypt.compare(password, hash)
  }

  async setSecurityPassword(password: string): Promise<void> {
    const normalized = password.trim()
    const hash = normalized ? await bcrypt.hash(normalized, 10) : ''
    await this.setValue(APP_CONFIG_SECURITY_PASSWORD_KEY, hash)
  }

  private getRaw(key: string): string | undefined {
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const envValue = this.readEnvValue(key)
    return envValue ?? undefined
  }

  private getSecurityPasswordHash(): string {
    return this.getString(APP_CONFIG_SECURITY_PASSWORD_KEY, '').trim()
  }

  async refreshCache(): Promise<void> {
    if (this.refreshInFlight) {
      await this.refreshInFlight
      return
    }
    this.refreshInFlight = (async () => {
      const rows = await this.prisma.appConfig.findMany()
      this.cache = new Map(rows.map(row => [row.key, row.value ?? '']))
    })()
    try {
      await this.refreshInFlight
    } finally {
      this.refreshInFlight = null
    }
  }

  private async seedFromEnv(keys: readonly string[]): Promise<void> {
    const existing = await this.prisma.appConfig.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true },
    })
    const existingKeys = new Set(existing.map(row => row.key))
    const toCreate = keys
      .filter(key => !existingKeys.has(key))
      .map(key => {
        const value = this.readEnvValue(key)
        if (value == null) return null
        return { key, value }
      })
      .filter(Boolean) as Array<{ key: string; value: string }>

    if (!toCreate.length) return
    await this.prisma.appConfig.createMany({
      data: toCreate,
      skipDuplicates: true,
    })
  }

  async getRemarks(keys: readonly string[]): Promise<Record<string, string>> {
    const rows = await this.prisma.appConfig.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, remark: true },
    })
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.remark ?? ''
    }
    return result
  }

  private async ensureRemarks(keys: readonly AppConfigSeedKey[]): Promise<void> {
    await this.prisma.$transaction(
      keys.map(key =>
        this.prisma.appConfig.updateMany({
          where: {
            key,
            OR: [{ remark: null }, { remark: '' }, { remark: { not: APP_CONFIG_REMARKS[key] } }],
          },
          data: { remark: APP_CONFIG_REMARKS[key] },
        })
      )
    )
  }

  private getRemarkForKey(key: string): string | undefined {
    if (Object.prototype.hasOwnProperty.call(APP_CONFIG_REMARKS, key)) {
      return APP_CONFIG_REMARKS[key as AppConfigSeedKey]
    }
    return undefined
  }

  private readEnvValue(key: string): string | null {
    const raw = this.configService.get<string>(key) ?? process.env[key]
    if (raw == null) return null
    return String(raw)
  }
}
