import { Injectable, Logger } from '@nestjs/common'
import { AppConfigService } from '../../modules/app-config/app-config.service'

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
  private queue: Array<QueueTask<unknown>> = []
  private inFlight = 0
  private lastStartAt = 0
  private blockedUntil = 0
  private timer?: NodeJS.Timeout

  constructor(private readonly appConfigService: AppConfigService) {}

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
        ? Math.max(retryAfterMs, this.getCooldownMs())
        : this.getCooldownMs()
    const cooldown = Math.max(0, Math.min(this.getMaxCooldownMs(), Math.floor(rawCooldown)))
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
    if (this.inFlight >= this.getMaxConcurrency()) {
      return
    }

    const task = this.queue.shift()
    if (!task) {
      return
    }

    const now = Date.now()
    const earliestStart = Math.max(this.blockedUntil, this.lastStartAt + this.getMinIntervalMs())
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

    if (this.inFlight < this.getMaxConcurrency()) {
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

  private getMaxConcurrency(): number {
    return this.readNumber('GLM_GLOBAL_CONCURRENCY', 1, value => value >= 1 && value <= 50)
  }

  private getMinIntervalMs(): number {
    return this.readNumber('GLM_GLOBAL_MIN_INTERVAL_MS', 500, value => value >= 0 && value <= 60000)
  }

  private getCooldownMs(): number {
    return this.readNumber(
      'GLM_GLOBAL_RATE_LIMIT_COOLDOWN_MS',
      2000,
      value => value >= 0 && value <= 120000
    )
  }

  private getMaxCooldownMs(): number {
    return this.readNumber(
      'GLM_GLOBAL_RATE_LIMIT_MAX_MS',
      15000,
      value => value >= 0 && value <= 300000
    )
  }

  private readNumber(key: string, fallback: number, isValid: (value: number) => boolean): number {
    return this.appConfigService.getNumber(key, fallback, isValid)
  }
}
