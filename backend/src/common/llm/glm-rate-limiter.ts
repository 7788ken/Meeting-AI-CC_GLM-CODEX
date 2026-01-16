import { Injectable, Logger } from '@nestjs/common'
import { AppConfigService } from '../../modules/app-config/app-config.service'

export type GlmRateLimiterBucket =
  | 'global'
  | 'asr'
  | 'segmentation'
  | 'translation'
  | 'analysis'

type QueueTask<T> = {
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  enqueuedAt: number
  label?: string
}

type BucketConfigKeys = {
  concurrency: string
  minIntervalMs: string
  cooldownMs: string
  maxCooldownMs: string
}

type BucketState = {
  queue: Array<QueueTask<unknown>>
  inFlight: number
  lastStartAt: number
  blockedUntil: number
  timer?: NodeJS.Timeout
}

const BUCKET_CONFIG_KEYS: Record<GlmRateLimiterBucket, BucketConfigKeys> = {
  global: {
    concurrency: 'GLM_GLOBAL_CONCURRENCY',
    minIntervalMs: 'GLM_GLOBAL_MIN_INTERVAL_MS',
    cooldownMs: 'GLM_GLOBAL_RATE_LIMIT_COOLDOWN_MS',
    maxCooldownMs: 'GLM_GLOBAL_RATE_LIMIT_MAX_MS',
  },
  asr: {
    concurrency: 'GLM_ASR_CONCURRENCY',
    minIntervalMs: 'GLM_ASR_MIN_INTERVAL_MS',
    cooldownMs: 'GLM_ASR_RATE_LIMIT_COOLDOWN_MS',
    maxCooldownMs: 'GLM_ASR_RATE_LIMIT_MAX_MS',
  },
  segmentation: {
    concurrency: 'GLM_TRANSCRIPT_EVENT_SEGMENT_CONCURRENCY',
    minIntervalMs: 'GLM_TRANSCRIPT_EVENT_SEGMENT_MIN_INTERVAL_MS',
    cooldownMs: 'GLM_TRANSCRIPT_EVENT_SEGMENT_RATE_LIMIT_COOLDOWN_MS',
    maxCooldownMs: 'GLM_TRANSCRIPT_EVENT_SEGMENT_RATE_LIMIT_MAX_MS',
  },
  translation: {
    concurrency: 'GLM_TRANSCRIPT_EVENT_SEGMENT_TRANSLATION_CONCURRENCY',
    minIntervalMs: 'GLM_TRANSCRIPT_EVENT_SEGMENT_TRANSLATION_MIN_INTERVAL_MS',
    cooldownMs: 'GLM_TRANSCRIPT_EVENT_SEGMENT_TRANSLATION_RATE_LIMIT_COOLDOWN_MS',
    maxCooldownMs: 'GLM_TRANSCRIPT_EVENT_SEGMENT_TRANSLATION_RATE_LIMIT_MAX_MS',
  },
  analysis: {
    concurrency: 'GLM_TRANSCRIPT_ANALYSIS_CONCURRENCY',
    minIntervalMs: 'GLM_TRANSCRIPT_ANALYSIS_MIN_INTERVAL_MS',
    cooldownMs: 'GLM_TRANSCRIPT_ANALYSIS_RATE_LIMIT_COOLDOWN_MS',
    maxCooldownMs: 'GLM_TRANSCRIPT_ANALYSIS_RATE_LIMIT_MAX_MS',
  },
}

@Injectable()
export class GlmRateLimiter {
  private readonly logger = new Logger(GlmRateLimiter.name)
  private bucketStates = new Map<GlmRateLimiterBucket, BucketState>()

  constructor(private readonly appConfigService: AppConfigService) {}

  schedule<T>(
    run: () => Promise<T>,
    options?: { bucket?: GlmRateLimiterBucket; label?: string }
  ): Promise<T> {
    const bucket = options?.bucket ?? 'global'
    const state = this.getBucketState(bucket)
    return new Promise<T>((resolve, reject) => {
      state.queue.push({ run, resolve, reject, enqueuedAt: Date.now(), label: options?.label })
      this.pump(bucket)
    })
  }

  onRateLimit(retryAfterMs?: number | null, bucket: GlmRateLimiterBucket = 'global'): void {
    const state = this.getBucketState(bucket)
    const now = Date.now()
    const rawCooldown =
      typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)
        ? Math.max(retryAfterMs, this.getCooldownMs(bucket))
        : this.getCooldownMs(bucket)
    const cooldown = Math.max(
      0,
      Math.min(this.getMaxCooldownMs(bucket), Math.floor(rawCooldown))
    )
    const nextBlockedUntil = now + cooldown

    if (nextBlockedUntil > state.blockedUntil) {
      state.blockedUntil = nextBlockedUntil
      this.logger.warn(`GLM(${bucket}) cooldown enabled for ${cooldown}ms`)
    }

    this.scheduleTimer(bucket, nextBlockedUntil - now)
  }

  isInCooldown(bucket: GlmRateLimiterBucket = 'global'): boolean {
    return Date.now() < this.getBucketState(bucket).blockedUntil
  }

  getCooldownRemainingMs(bucket: GlmRateLimiterBucket = 'global'): number {
    const remaining = this.getBucketState(bucket).blockedUntil - Date.now()
    return Math.max(0, Math.floor(remaining))
  }

  private getBucketState(bucket: GlmRateLimiterBucket): BucketState {
    const existing = this.bucketStates.get(bucket)
    if (existing) return existing
    const created: BucketState = {
      queue: [],
      inFlight: 0,
      lastStartAt: 0,
      blockedUntil: 0,
      timer: undefined,
    }
    this.bucketStates.set(bucket, created)
    return created
  }

  private pump(bucket: GlmRateLimiterBucket): void {
    const state = this.getBucketState(bucket)
    if (state.inFlight >= this.getMaxConcurrency(bucket)) {
      return
    }

    const task = state.queue.shift()
    if (!task) {
      return
    }

    const now = Date.now()
    const earliestStart = Math.max(
      state.blockedUntil,
      state.lastStartAt + this.getMinIntervalMs(bucket)
    )
    if (now < earliestStart) {
      state.queue.unshift(task)
      this.scheduleTimer(bucket, earliestStart - now)
      return
    }

    state.inFlight += 1
    state.lastStartAt = Date.now()

    Promise.resolve()
      .then(task.run)
      .then(task.resolve, task.reject)
      .finally(() => {
        state.inFlight = Math.max(0, state.inFlight - 1)
        this.pump(bucket)
      })

    if (state.inFlight < this.getMaxConcurrency(bucket)) {
      this.pump(bucket)
    }
  }

  private scheduleTimer(bucket: GlmRateLimiterBucket, delayMs: number): void {
    if (!Number.isFinite(delayMs)) return
    const delay = Math.max(0, Math.floor(delayMs))
    if (delay === 0) {
      this.pump(bucket)
      return
    }
    const state = this.getBucketState(bucket)
    if (state.timer) {
      clearTimeout(state.timer)
    }
    state.timer = setTimeout(() => {
      state.timer = undefined
      this.pump(bucket)
    }, delay)
  }

  private getMaxConcurrency(bucket: GlmRateLimiterBucket): number {
    return this.readBucketNumber(
      bucket,
      'concurrency',
      1,
      value => value >= 1 && value <= 50
    )
  }

  private getMinIntervalMs(bucket: GlmRateLimiterBucket): number {
    return this.readBucketNumber(
      bucket,
      'minIntervalMs',
      500,
      value => value >= 0 && value <= 60000
    )
  }

  private getCooldownMs(bucket: GlmRateLimiterBucket): number {
    return this.readBucketNumber(
      bucket,
      'cooldownMs',
      2000,
      value => value >= 0 && value <= 120000
    )
  }

  private getMaxCooldownMs(bucket: GlmRateLimiterBucket): number {
    return this.readBucketNumber(
      bucket,
      'maxCooldownMs',
      15000,
      value => value >= 0 && value <= 300000
    )
  }

  private readBucketNumber(
    bucket: GlmRateLimiterBucket,
    key: keyof BucketConfigKeys,
    fallback: number,
    isValid: (value: number) => boolean
  ): number {
    const bucketKeys = BUCKET_CONFIG_KEYS[bucket] ?? BUCKET_CONFIG_KEYS.global
    if (bucket === 'global') {
      return this.appConfigService.getNumber(bucketKeys[key], fallback, isValid)
    }

    const scoped = this.appConfigService.getNumber(bucketKeys[key], Number.NaN, isValid)
    if (Number.isFinite(scoped)) return scoped

    const globalKeys = BUCKET_CONFIG_KEYS.global
    return this.appConfigService.getNumber(globalKeys[key], fallback, isValid)
  }
}
