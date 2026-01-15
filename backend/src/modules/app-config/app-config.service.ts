import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../database/prisma.service'
import { APP_CONFIG_SEED_KEYS } from './app-config.constants'

@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name)
  private cache = new Map<string, string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedFromEnv(APP_CONFIG_SEED_KEYS)
      await this.refreshCache()
    } catch (error) {
      this.logger.error(
        'Failed to initialize app config cache',
        error instanceof Error ? error.stack : String(error)
      )
    }
  }

  getString(key: string, fallback = ''): string {
    const raw = this.getRaw(key)
    if (raw == null) return fallback
    return String(raw)
  }

  getNumber(
    key: string,
    fallback: number,
    isValid?: (value: number) => boolean
  ): number {
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
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, value: normalized },
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
          create: { key, value: value ?? '' },
          update: { value: value ?? '' },
        })
      )
    )
    for (const [key, value] of entries) {
      this.cache.set(key, value ?? '')
    }
  }

  private getRaw(key: string): string | undefined {
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const envValue = this.readEnvValue(key)
    return envValue ?? undefined
  }

  private async refreshCache(): Promise<void> {
    const rows = await this.prisma.appConfig.findMany()
    this.cache = new Map(rows.map(row => [row.key, row.value ?? '']))
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

  private readEnvValue(key: string): string | null {
    const raw = this.configService.get<string>(key) ?? process.env[key]
    if (raw == null) return null
    return String(raw)
  }
}
