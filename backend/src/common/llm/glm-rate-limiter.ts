import { Injectable, Logger } from '@nestjs/common'
import { randomBytes } from 'crypto'
import os from 'os'
import { AppConfigService } from '../../modules/app-config/app-config.service'

export type GlmRateLimiterBucket =
  | 'global'
  | 'asr'
  | 'segmentation'
  | 'segmentation_rebuild'
  | 'translation'
  | 'analysis'

type QueueTask<T> = {
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  enqueuedAt: number
  label?: string
  key?: string
  stage?: TaskLogStage
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
  externalInFlight: number
  lastStartAt: number
  blockedUntil: number
  rateLimitCount: number
  lastRateLimitAt: number
  durationSamples: number[]
  queueDelaySamples: number[]
  timer?: NodeJS.Timeout
}

type TaskLogStage = 'completed' | 'stream_established' | 'stream_completed'

type TaskLogEntry = {
  id: string
  bucket: GlmRateLimiterBucket
  label: string
  waitMs: number
  durationMs: number
  startedAt: number
  finishedAt: number
  status: 'ok' | 'error'
  stage: TaskLogStage
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
  segmentation_rebuild: {
    concurrency: 'GLM_TRANSCRIPT_EVENT_SEGMENT_REBUILD_CONCURRENCY',
    minIntervalMs: 'GLM_TRANSCRIPT_EVENT_SEGMENT_REBUILD_MIN_INTERVAL_MS',
    cooldownMs: 'GLM_TRANSCRIPT_EVENT_SEGMENT_REBUILD_RATE_LIMIT_COOLDOWN_MS',
    maxCooldownMs: 'GLM_TRANSCRIPT_EVENT_SEGMENT_REBUILD_RATE_LIMIT_MAX_MS',
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

const BUCKET_PUMP_WEIGHTS: Record<GlmRateLimiterBucket, number> = {
  global: 4,
  asr: 4,
  segmentation: 4,
  segmentation_rebuild: 1,
  translation: 4,
  analysis: 6,
}

const INDEPENDENT_BUCKETS = new Set<GlmRateLimiterBucket>(['analysis'])

@Injectable()
export class GlmRateLimiter {
  private readonly logger = new Logger(GlmRateLimiter.name)
  private readonly instanceId =
    process.env.INSTANCE_ID?.trim() ||
    process.env.HOSTNAME?.trim() ||
    os.hostname() ||
    randomBytes(6).toString('hex')
  private bucketStates = new Map<GlmRateLimiterBucket, BucketState>()
  private bucketPumpCursor = 0
  private taskLog: TaskLogEntry[] = []
  private taskLogSequence = 1
  private readonly taskLogLimit = 120

  constructor(private readonly appConfigService: AppConfigService) {}

  schedule<T>(
    run: () => Promise<T>,
    options?: { bucket?: GlmRateLimiterBucket; label?: string; key?: string; stage?: TaskLogStage }
  ): Promise<T> {
    const bucket = options?.bucket ?? 'global'
    return this.scheduleInBucket(bucket, run, options?.label, options?.key, options?.stage)
  }

  onRateLimit(retryAfterMs?: number | null, bucket: GlmRateLimiterBucket = 'global'): void {
    this.applyRateLimit(bucket, retryAfterMs, { log: true })
    if (bucket !== 'global' && !this.isIndependentBucket(bucket)) {
      this.applyRateLimit('global', retryAfterMs, { log: false, count: false })
    }
  }

  isInCooldown(bucket: GlmRateLimiterBucket = 'global'): boolean {
    return Date.now() < this.getBucketState(bucket).blockedUntil
  }

  getCooldownRemainingMs(bucket: GlmRateLimiterBucket = 'global'): number {
    const remaining = this.getBucketState(bucket).blockedUntil - Date.now()
    return Math.max(0, Math.floor(remaining))
  }

  getQueueStats(): {
    totalPending: number
    instanceId: string
    buckets: Record<
      GlmRateLimiterBucket,
      {
        queue: number
        inFlight: number
        rateLimitCount: number
        lastRateLimitAt: number
        durationP50Ms: number | null
        durationP95Ms: number | null
        queueDelayP50Ms: number | null
        queueDelayP95Ms: number | null
      }
    >
  } {
    const buckets = {} as Record<
      GlmRateLimiterBucket,
      {
        queue: number
        inFlight: number
        rateLimitCount: number
        lastRateLimitAt: number
        durationP50Ms: number | null
        durationP95Ms: number | null
        queueDelayP50Ms: number | null
        queueDelayP95Ms: number | null
      }
    >
    const bucketList = Object.keys(BUCKET_CONFIG_KEYS) as GlmRateLimiterBucket[]
    for (const bucket of bucketList) {
      const state = this.getBucketState(bucket)
      const inFlight = state.inFlight + state.externalInFlight
      buckets[bucket] = {
        queue: state.queue.length,
        inFlight,
        rateLimitCount: state.rateLimitCount,
        lastRateLimitAt: state.lastRateLimitAt,
        durationP50Ms: this.computePercentile(state.durationSamples, 0.5),
        durationP95Ms: this.computePercentile(state.durationSamples, 0.95),
        queueDelayP50Ms: this.computePercentile(state.queueDelaySamples, 0.5),
        queueDelayP95Ms: this.computePercentile(state.queueDelaySamples, 0.95),
      }
    }
    const totalQueued = bucketList.reduce((sum, bucket) => sum + buckets[bucket].queue, 0)
    const totalInFlight = bucketList.reduce((sum, bucket) => sum + buckets[bucket].inFlight, 0)
    const aggregatedBuckets = bucketList.filter(
      bucket => bucket === 'global' || !this.isIndependentBucket(bucket)
    )
    const totalRateLimitCount = aggregatedBuckets.reduce(
      (sum, bucket) => sum + buckets[bucket].rateLimitCount,
      0
    )
    const latestRateLimitAt = aggregatedBuckets.reduce(
      (max, bucket) => Math.max(max, buckets[bucket].lastRateLimitAt),
      0
    )
    const global = buckets.global
    global.queue = totalQueued
    global.inFlight = totalInFlight
    global.rateLimitCount = totalRateLimitCount
    global.lastRateLimitAt = latestRateLimitAt
    return {
      totalPending: totalQueued + totalInFlight,
      instanceId: this.instanceId,
      buckets,
    }
  }

  getTaskLog(): TaskLogEntry[] {
    return [...this.taskLog]
  }

  recordTaskLog(entry: TaskLogEntry): void {
    this.appendTaskLog(entry)
  }

  trackExternalInFlight(bucket: GlmRateLimiterBucket): () => void {
    const state = this.getBucketState(bucket)
    state.externalInFlight += 1
    let released = false
    return () => {
      if (released) return
      released = true
      state.externalInFlight = Math.max(0, state.externalInFlight - 1)
      this.pump(bucket)
    }
  }

  private getBucketState(bucket: GlmRateLimiterBucket): BucketState {
    const existing = this.bucketStates.get(bucket)
    if (existing) return existing
    const created: BucketState = {
      queue: [],
      inFlight: 0,
      externalInFlight: 0,
      lastStartAt: 0,
      blockedUntil: 0,
      rateLimitCount: 0,
      lastRateLimitAt: 0,
      durationSamples: [],
      queueDelaySamples: [],
      timer: undefined,
    }
    this.bucketStates.set(bucket, created)
    return created
  }

  private scheduleInBucket<T>(
    bucket: GlmRateLimiterBucket,
    run: () => Promise<T>,
    label?: string,
    key?: string,
    stage?: TaskLogStage
  ): Promise<T> {
    const state = this.getBucketState(bucket)
    return new Promise<T>((resolve, reject) => {
      if (key) {
        for (let i = state.queue.length - 1; i >= 0; i -= 1) {
          if (state.queue[i]?.key !== key) continue
          const superseded = state.queue.splice(i, 1)[0]
          superseded?.reject(new Error('Superseded by newer request'))
        }
      }
      state.queue.push({ run, resolve, reject, enqueuedAt: Date.now(), label, key, stage })
      this.pump(bucket)
    })
  }

  private applyRateLimit(
    bucket: GlmRateLimiterBucket,
    retryAfterMs?: number | null,
    options?: { log?: boolean; count?: boolean }
  ): void {
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
      if (options?.log !== false) {
        this.logger.warn(`GLM(${bucket}) cooldown enabled for ${cooldown}ms`)
      }
    }
    if (options?.count !== false) {
      state.rateLimitCount += 1
      state.lastRateLimitAt = now
    }

    this.scheduleTimer(bucket, nextBlockedUntil - now)
  }

  private pump(bucket: GlmRateLimiterBucket): void {
    const state = this.getBucketState(bucket)
    if (state.inFlight + state.externalInFlight >= this.getMaxConcurrency(bucket)) return
    const task = state.queue.shift()
    if (!task) return

    const globalState =
      bucket === 'global' || this.isIndependentBucket(bucket) ? null : this.getBucketState('global')
    if (globalState && globalState.inFlight >= this.getMaxConcurrency('global')) {
      state.queue.unshift(task)
      return
    }

    const now = Date.now()
    const earliestStart = Math.max(
      state.blockedUntil,
      state.lastStartAt + this.getMinIntervalMs(bucket),
      globalState ? globalState.blockedUntil : 0,
      globalState ? globalState.lastStartAt + this.getMinIntervalMs('global') : 0
    )

    if (now < earliestStart) {
      state.queue.unshift(task)
      this.scheduleTimer(bucket, earliestStart - now)
      return
    }

    state.inFlight += 1
    state.lastStartAt = now
    if (globalState) {
      globalState.inFlight += 1
      globalState.lastStartAt = now
    }
    const startedAt = now
    const queueDelayMs = Math.max(0, startedAt - task.enqueuedAt)
    this.recordQueueDelay(state, queueDelayMs)
    if (globalState) {
      this.recordQueueDelay(globalState, queueDelayMs)
    }

    let taskStatus: 'ok' | 'error' = 'ok'
    Promise.resolve()
      .then(task.run)
      .catch(error => {
        taskStatus = 'error'
        throw error
      })
      .then(task.resolve, task.reject)
      .finally(() => {
        const finishedAt = Date.now()
        const durationMs = Math.max(0, finishedAt - startedAt)
        this.recordDuration(state, durationMs)
        if (globalState) {
          this.recordDuration(globalState, durationMs)
        }
        this.appendTaskLog({
          id: task.key?.trim() || `task-${this.taskLogSequence++}`,
          bucket,
          label: task.label?.trim() || bucket,
          waitMs: queueDelayMs,
          durationMs,
          startedAt,
          finishedAt,
          status: taskStatus,
          stage: task.stage ?? 'completed',
        })
        state.inFlight = Math.max(0, state.inFlight - 1)
        if (globalState) {
          globalState.inFlight = Math.max(0, globalState.inFlight - 1)
        }
        this.pump(bucket)
        if (globalState) {
          this.pump('global')
        }
        this.pumpAllBuckets()
      })

    if (state.inFlight + state.externalInFlight < this.getMaxConcurrency(bucket)) {
      this.pump(bucket)
    }
  }

  private appendTaskLog(entry: TaskLogEntry): void {
    this.taskLog.unshift(entry)
    if (this.taskLog.length > this.taskLogLimit) {
      this.taskLog.splice(this.taskLogLimit)
    }
  }

  private pumpAllBuckets(): void {
    const buckets = this.buildBucketPumpOrder()
    if (!buckets.length) return
    const start = this.bucketPumpCursor % buckets.length
    for (let i = 0; i < buckets.length; i += 1) {
      const idx = (start + i) % buckets.length
      this.pump(buckets[idx]!)
    }
    this.bucketPumpCursor = (start + 1) % buckets.length
  }

  private isIndependentBucket(bucket: GlmRateLimiterBucket): boolean {
    return INDEPENDENT_BUCKETS.has(bucket)
  }

  private recordDuration(state: BucketState, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return
    state.durationSamples.push(Math.floor(durationMs))
    const limit = 60
    if (state.durationSamples.length > limit) {
      state.durationSamples.splice(0, state.durationSamples.length - limit)
    }
  }

  private recordQueueDelay(state: BucketState, delayMs: number): void {
    if (!Number.isFinite(delayMs) || delayMs < 0) return
    state.queueDelaySamples.push(Math.floor(delayMs))
    const limit = 60
    if (state.queueDelaySamples.length > limit) {
      state.queueDelaySamples.splice(0, state.queueDelaySamples.length - limit)
    }
  }

  private computePercentile(samples: number[], percentile: number): number | null {
    if (!samples.length) return null
    const normalized = Math.min(1, Math.max(0, percentile))
    const sorted = [...samples].sort((a, b) => a - b)
    const index = Math.floor((sorted.length - 1) * normalized)
    return sorted[index] ?? null
  }

  private buildBucketPumpOrder(): GlmRateLimiterBucket[] {
    const buckets = Object.keys(BUCKET_CONFIG_KEYS) as GlmRateLimiterBucket[]
    const order: GlmRateLimiterBucket[] = []
    for (const bucket of buckets) {
      const weight = Math.max(1, Math.floor(BUCKET_PUMP_WEIGHTS[bucket] ?? 1))
      for (let i = 0; i < weight; i += 1) {
        order.push(bucket)
      }
    }
    return order
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
