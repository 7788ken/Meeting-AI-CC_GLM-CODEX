import { Injectable, OnModuleInit } from '@nestjs/common'
import {
  DEFAULT_SEGMENTATION_STRICT_SYSTEM_PROMPT,
  DEFAULT_SEGMENTATION_SYSTEM_PROMPT,
} from './transcript-event-segmentation.prompt'
import { AppConfigService } from '../app-config/app-config.service'

export interface TranscriptEventSegmentationConfig {
  systemPrompt: string
  strictSystemPrompt: string
  windowEvents: number
  intervalMs: number
  triggerOnStopTranscribe: boolean
  model: string
  maxTokens: number
  jsonMode: boolean
  bumpMaxTokens: number
  retryMax: number
  retryBaseMs: number
  retryMaxMs: number
  degradeOnStrictFail: boolean
  maxSegmentsPerRun: number
}

const WINDOW_EVENTS_MIN = 5
const WINDOW_EVENTS_MAX = 2000
const INTERVAL_MS_MAX = 10 * 60 * 1000
const MAX_TOKENS_MIN = 256
const MAX_TOKENS_MAX = 8192
const RETRY_MAX_MIN = 0
const RETRY_MAX_MAX = 10
const RETRY_BASE_MS_MAX = 60000
const RETRY_MAX_MS_MAX = 120000
const MAX_SEGMENTS_PER_RUN_MIN = 1
const MAX_SEGMENTS_PER_RUN_MAX = 100

@Injectable()
export class TranscriptEventSegmentationConfigService implements OnModuleInit {
  private config: TranscriptEventSegmentationConfig

  constructor(private readonly appConfigService: AppConfigService) {
    this.config = this.buildDefaultConfig()
  }

  async onModuleInit(): Promise<void> {
    this.config = this.buildDefaultConfig()
  }

  getConfig(): TranscriptEventSegmentationConfig {
    return { ...this.config }
  }

  async reloadFromStorage(): Promise<TranscriptEventSegmentationConfig> {
    await this.appConfigService.refreshCache()
    this.config = this.buildDefaultConfig()
    return { ...this.config }
  }

  async updateConfig(
    partial: Partial<TranscriptEventSegmentationConfig>
  ): Promise<TranscriptEventSegmentationConfig> {
    const next = this.normalizeConfig(partial, this.config)
    this.config = next
    await this.persistConfig(next)
    return { ...next }
  }

  async resetConfig(): Promise<TranscriptEventSegmentationConfig> {
    this.config = this.buildEnvConfig()
    await this.persistConfig(this.config)
    return { ...this.config }
  }

  private buildDefaultConfig(): TranscriptEventSegmentationConfig {
    const windowEvents =
      this.readNumberFromConfig('TRANSCRIPT_EVENTS_SEGMENT_CHUNK_SIZE') ??
      this.readNumberFromConfig('TRANSCRIPT_EVENTS_SEGMENT_WINDOW_EVENTS') ??
      4

    const intervalMs = this.readNumberFromConfig('TRANSCRIPT_EVENTS_SEGMENT_INTERVAL_MS') ?? 3000

    const model = this.appConfigService.getString('GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL', '').trim()

    const maxTokens = this.readNumberFromConfig('GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS') ?? 2000

    const jsonMode = this.readBooleanFromConfig('GLM_TRANSCRIPT_EVENT_SEGMENT_JSON_MODE', true)

    const bumpMaxTokens =
      this.readNumberFromConfig('GLM_TRANSCRIPT_EVENT_SEGMENT_BUMP_MAX_TOKENS') ?? 4096

    const retryMax = this.readNumberFromConfig('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX') ?? 5
    const retryBaseMs =
      this.readNumberFromConfig('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_BASE_MS') ?? 500
    const retryMaxMs =
      this.readNumberFromConfig('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX_MS') ?? 8000

    const degradeOnStrictFail = this.readBooleanFromConfig(
      'GLM_TRANSCRIPT_EVENT_SEGMENT_DEGRADE_ON_STRICT_FAIL',
      false
    )

    const maxSegmentsPerRun =
      this.readNumberFromConfig('TRANSCRIPT_EVENTS_SEGMENT_MAX_SEGMENTS_PER_RUN') ?? 8

    return {
      systemPrompt: this.normalizeText(
        this.appConfigService.getString(
          'TRANSCRIPT_EVENTS_SEGMENT_SYSTEM_PROMPT',
          DEFAULT_SEGMENTATION_SYSTEM_PROMPT
        ),
        DEFAULT_SEGMENTATION_SYSTEM_PROMPT
      ),
      strictSystemPrompt: this.normalizeText(
        this.appConfigService.getString(
          'TRANSCRIPT_EVENTS_SEGMENT_STRICT_SYSTEM_PROMPT',
          DEFAULT_SEGMENTATION_STRICT_SYSTEM_PROMPT
        ),
        DEFAULT_SEGMENTATION_STRICT_SYSTEM_PROMPT
      ),
      windowEvents: this.normalizeInt(windowEvents, 120, WINDOW_EVENTS_MIN, WINDOW_EVENTS_MAX),
      intervalMs: this.normalizeInt(intervalMs, 3000, 0, INTERVAL_MS_MAX),
      triggerOnStopTranscribe: this.readBooleanFromConfig(
        'TRANSCRIPT_EVENTS_SEGMENT_TRIGGER_ON_STOP_TRANSCRIBE',
        true
      ),
      model: this.normalizeText(model, ''),
      maxTokens: this.normalizeInt(maxTokens, 2000, MAX_TOKENS_MIN, MAX_TOKENS_MAX),
      jsonMode,
      bumpMaxTokens: this.normalizeInt(bumpMaxTokens, 4096, MAX_TOKENS_MIN, MAX_TOKENS_MAX),
      retryMax: this.normalizeInt(retryMax, 5, RETRY_MAX_MIN, RETRY_MAX_MAX),
      retryBaseMs: this.normalizeInt(retryBaseMs, 500, 0, RETRY_BASE_MS_MAX),
      retryMaxMs: this.normalizeInt(retryMaxMs, 8000, 0, RETRY_MAX_MS_MAX),
      degradeOnStrictFail,
      maxSegmentsPerRun: this.normalizeInt(
        maxSegmentsPerRun,
        8,
        MAX_SEGMENTS_PER_RUN_MIN,
        MAX_SEGMENTS_PER_RUN_MAX
      ),
    }
  }

  private buildEnvConfig(): TranscriptEventSegmentationConfig {
    const windowEvents =
      this.readNumberFromEnv('TRANSCRIPT_EVENTS_SEGMENT_CHUNK_SIZE') ??
      this.readNumberFromEnv('TRANSCRIPT_EVENTS_SEGMENT_WINDOW_EVENTS') ??
      4

    const intervalMs = this.readNumberFromEnv('TRANSCRIPT_EVENTS_SEGMENT_INTERVAL_MS') ?? 3000
    const model = (process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL || '').trim()
    const maxTokens = this.readNumberFromEnv('GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS') ?? 2000
    const jsonMode = this.readBooleanFromEnv('GLM_TRANSCRIPT_EVENT_SEGMENT_JSON_MODE', true)
    const bumpMaxTokens =
      this.readNumberFromEnv('GLM_TRANSCRIPT_EVENT_SEGMENT_BUMP_MAX_TOKENS') ?? 4096
    const retryMax = this.readNumberFromEnv('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX') ?? 5
    const retryBaseMs = this.readNumberFromEnv('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_BASE_MS') ?? 500
    const retryMaxMs = this.readNumberFromEnv('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX_MS') ?? 8000
    const degradeOnStrictFail = this.readBooleanFromEnv(
      'GLM_TRANSCRIPT_EVENT_SEGMENT_DEGRADE_ON_STRICT_FAIL',
      false
    )
    const maxSegmentsPerRun =
      this.readNumberFromEnv('TRANSCRIPT_EVENTS_SEGMENT_MAX_SEGMENTS_PER_RUN') ?? 8

    return {
      systemPrompt: DEFAULT_SEGMENTATION_SYSTEM_PROMPT,
      strictSystemPrompt: DEFAULT_SEGMENTATION_STRICT_SYSTEM_PROMPT,
      windowEvents: this.normalizeInt(windowEvents, 120, WINDOW_EVENTS_MIN, WINDOW_EVENTS_MAX),
      intervalMs: this.normalizeInt(intervalMs, 3000, 0, INTERVAL_MS_MAX),
      triggerOnStopTranscribe: this.readBooleanFromEnv(
        'TRANSCRIPT_EVENTS_SEGMENT_TRIGGER_ON_STOP_TRANSCRIBE',
        true
      ),
      model: this.normalizeText(model, ''),
      maxTokens: this.normalizeInt(maxTokens, 2000, MAX_TOKENS_MIN, MAX_TOKENS_MAX),
      jsonMode,
      bumpMaxTokens: this.normalizeInt(bumpMaxTokens, 4096, MAX_TOKENS_MIN, MAX_TOKENS_MAX),
      retryMax: this.normalizeInt(retryMax, 5, RETRY_MAX_MIN, RETRY_MAX_MAX),
      retryBaseMs: this.normalizeInt(retryBaseMs, 500, 0, RETRY_BASE_MS_MAX),
      retryMaxMs: this.normalizeInt(retryMaxMs, 8000, 0, RETRY_MAX_MS_MAX),
      degradeOnStrictFail,
      maxSegmentsPerRun: this.normalizeInt(
        maxSegmentsPerRun,
        8,
        MAX_SEGMENTS_PER_RUN_MIN,
        MAX_SEGMENTS_PER_RUN_MAX
      ),
    }
  }

  private normalizeConfig(
    input: Partial<TranscriptEventSegmentationConfig>,
    base: TranscriptEventSegmentationConfig
  ): TranscriptEventSegmentationConfig {
    return {
      systemPrompt: this.normalizeText(input.systemPrompt, base.systemPrompt),
      strictSystemPrompt: this.normalizeText(input.strictSystemPrompt, base.strictSystemPrompt),
      windowEvents: this.normalizeInt(
        input.windowEvents,
        base.windowEvents,
        WINDOW_EVENTS_MIN,
        WINDOW_EVENTS_MAX
      ),
      intervalMs: this.normalizeInt(input.intervalMs, base.intervalMs, 0, INTERVAL_MS_MAX),
      triggerOnStopTranscribe: this.normalizeBoolean(
        input.triggerOnStopTranscribe,
        base.triggerOnStopTranscribe
      ),
      model: this.normalizeText(input.model, base.model),
      maxTokens: this.normalizeInt(input.maxTokens, base.maxTokens, MAX_TOKENS_MIN, MAX_TOKENS_MAX),
      jsonMode: this.normalizeBoolean(input.jsonMode, base.jsonMode),
      bumpMaxTokens: this.normalizeInt(
        input.bumpMaxTokens,
        base.bumpMaxTokens,
        MAX_TOKENS_MIN,
        MAX_TOKENS_MAX
      ),
      retryMax: this.normalizeInt(input.retryMax, base.retryMax, RETRY_MAX_MIN, RETRY_MAX_MAX),
      retryBaseMs: this.normalizeInt(input.retryBaseMs, base.retryBaseMs, 0, RETRY_BASE_MS_MAX),
      retryMaxMs: this.normalizeInt(input.retryMaxMs, base.retryMaxMs, 0, RETRY_MAX_MS_MAX),
      degradeOnStrictFail: this.normalizeBoolean(
        input.degradeOnStrictFail,
        base.degradeOnStrictFail
      ),
      maxSegmentsPerRun: this.normalizeInt(
        input.maxSegmentsPerRun,
        base.maxSegmentsPerRun,
        MAX_SEGMENTS_PER_RUN_MIN,
        MAX_SEGMENTS_PER_RUN_MAX
      ),
    }
  }

  private readNumberFromConfig(key: string): number | undefined {
    const value = this.appConfigService.getNumber(key, Number.NaN)
    return Number.isFinite(value) ? value : undefined
  }

  private readBooleanFromConfig(key: string, fallback: boolean): boolean {
    return this.appConfigService.getBoolean(key, fallback)
  }

  private readNumberFromEnv(key: string): number | undefined {
    const raw = process.env[key]
    if (!raw) return undefined
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }

  private readBooleanFromEnv(key: string, fallback: boolean): boolean {
    const raw = process.env[key]
    if (raw == null || raw === '') return fallback
    const normalized = String(raw).trim().toLowerCase()
    if (normalized === '0' || normalized === 'false') return false
    if (normalized === '1' || normalized === 'true') return true
    return fallback
  }

  private async persistConfig(next: TranscriptEventSegmentationConfig): Promise<void> {
    await this.appConfigService.setMany({
      TRANSCRIPT_EVENTS_SEGMENT_SYSTEM_PROMPT: next.systemPrompt,
      TRANSCRIPT_EVENTS_SEGMENT_STRICT_SYSTEM_PROMPT: next.strictSystemPrompt,
      TRANSCRIPT_EVENTS_SEGMENT_CHUNK_SIZE: String(next.windowEvents),
      TRANSCRIPT_EVENTS_SEGMENT_INTERVAL_MS: String(next.intervalMs),
      TRANSCRIPT_EVENTS_SEGMENT_TRIGGER_ON_STOP_TRANSCRIBE: next.triggerOnStopTranscribe
        ? '1'
        : '0',
      GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL: next.model,
      GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS: String(next.maxTokens),
      GLM_TRANSCRIPT_EVENT_SEGMENT_JSON_MODE: next.jsonMode ? '1' : '0',
      GLM_TRANSCRIPT_EVENT_SEGMENT_BUMP_MAX_TOKENS: String(next.bumpMaxTokens),
      GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX: String(next.retryMax),
      GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_BASE_MS: String(next.retryBaseMs),
      GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX_MS: String(next.retryMaxMs),
      GLM_TRANSCRIPT_EVENT_SEGMENT_DEGRADE_ON_STRICT_FAIL: next.degradeOnStrictFail ? '1' : '0',
      TRANSCRIPT_EVENTS_SEGMENT_MAX_SEGMENTS_PER_RUN: String(next.maxSegmentsPerRun),
    })
  }

  private normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      const rounded = Math.floor(parsed)
      if (rounded >= min && rounded <= max) return rounded
    }
    return fallback
  }

  private normalizeBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback
  }

  private normalizeText(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback
    const trimmed = value.trim()
    return trimmed ? trimmed : fallback
  }
}
