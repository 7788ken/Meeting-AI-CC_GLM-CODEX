import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

type QueueTask<T> = {
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  enqueuedAt: number
  label?: string
}

@Injectable()
export class GlmRateLimiter {
  private readonly logger = new Logger(GlmRateLimiter.name)
  private readonly maxConcurrency: number
  private readonly minIntervalMs: number
  private readonly cooldownMs: number
  private readonly maxCooldownMs: number
  private queue: Array<QueueTask<unknown>> = []
  private inFlight = 0
  private lastStartAt = 0
  private blockedUntil = 0
  private timer?: NodeJS.Timeout

  constructor(private readonly configService: ConfigService) {
    this.maxConcurrency = this.readNumber(
      'GLM_GLOBAL_CONCURRENCY',
      1,
      value => value >= 1 && value <= 50
    )
    this.minIntervalMs = this.readNumber(
      'GLM_GLOBAL_MIN_INTERVAL_MS',
      500,
      value => value >= 0 && value <= 60000
    )
    this.cooldownMs = this.readNumber(
      'GLM_GLOBAL_RATE_LIMIT_COOLDOWN_MS',
      2000,
      value => value >= 0 && value <= 120000
    )
    this.maxCooldownMs = this.readNumber(
      'GLM_GLOBAL_RATE_LIMIT_MAX_MS',
      15000,
      value => value >= 0 && value <= 300000
    )
  }

  schedule<T>(run: () => Promise<T>, label?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ run, resolve, reject, enqueuedAt: Date.now(), label })
      this.pump()
    })
  }

  onRateLimit(retryAfterMs?: number | null): void {
    const now = Date.now()
    const rawCooldown =
      typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)
        ? Math.max(retryAfterMs, this.cooldownMs)
        : this.cooldownMs
    const cooldown = Math.max(0, Math.min(this.maxCooldownMs, Math.floor(rawCooldown)))
    const nextBlockedUntil = now + cooldown

    if (nextBlockedUntil > this.blockedUntil) {
      this.blockedUntil = nextBlockedUntil
      this.logger.warn(`GLM global cooldown enabled for ${cooldown}ms`)
    }

    this.scheduleTimer(nextBlockedUntil - now)
  }

  isInCooldown(): boolean {
    return Date.now() < this.blockedUntil
  }

  private pump(): void {
    if (this.inFlight >= this.maxConcurrency) {
      return
    }

    const task = this.queue.shift()
    if (!task) {
      return
    }

    const now = Date.now()
    const earliestStart = Math.max(this.blockedUntil, this.lastStartAt + this.minIntervalMs)
    if (now < earliestStart) {
      this.queue.unshift(task)
      this.scheduleTimer(earliestStart - now)
      return
    }

    this.inFlight += 1
    this.lastStartAt = Date.now()

    Promise.resolve()
      .then(task.run)
      .then(task.resolve, task.reject)
      .finally(() => {
        this.inFlight = Math.max(0, this.inFlight - 1)
        this.pump()
      })

    if (this.inFlight < this.maxConcurrency) {
      this.pump()
    }
  }

  private scheduleTimer(delayMs: number): void {
    if (!Number.isFinite(delayMs)) return
    const delay = Math.max(0, Math.floor(delayMs))
    if (delay === 0) {
      this.pump()
      return
    }
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.pump()
    }, delay)
  }

  private readNumber(key: string, fallback: number, isValid: (value: number) => boolean): number {
    const raw = this.configService.get<string>(key) || process.env[key]
    if (!raw) return fallback
    const value = Number(raw)
    return Number.isFinite(value) && isValid(value) ? value : fallback
  }
}
