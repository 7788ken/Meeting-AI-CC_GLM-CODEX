import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DEFAULT_SEGMENTATION_STRICT_SYSTEM_PROMPT,
  DEFAULT_SEGMENTATION_SYSTEM_PROMPT,
} from './transcript-event-segmentation.prompt'

export interface TranscriptEventSegmentationConfig {
  systemPrompt: string
  strictSystemPrompt: string
  windowEvents: number
  intervalMs: number
  triggerOnEndTurn: boolean
  triggerOnStopTranscribe: boolean
  model: string
  maxTokens: number
  jsonMode: boolean
}

const WINDOW_EVENTS_MIN = 5
const WINDOW_EVENTS_MAX = 2000
const INTERVAL_MS_MAX = 10 * 60 * 1000
const MAX_TOKENS_MIN = 256
const MAX_TOKENS_MAX = 8192

@Injectable()
export class TranscriptEventSegmentationConfigService {
  private config: TranscriptEventSegmentationConfig

  constructor(private readonly configService: ConfigService) {
    this.config = this.buildDefaultConfig()
  }

  getConfig(): TranscriptEventSegmentationConfig {
    return { ...this.config }
  }

  updateConfig(
    partial: Partial<TranscriptEventSegmentationConfig>
  ): TranscriptEventSegmentationConfig {
    const next = this.normalizeConfig(partial, this.config)
    this.config = next
    return { ...next }
  }

  resetConfig(): TranscriptEventSegmentationConfig {
    this.config = this.buildDefaultConfig()
    return { ...this.config }
  }

  private buildDefaultConfig(): TranscriptEventSegmentationConfig {
    const windowEvents =
      this.readNumberFromEnv('TRANSCRIPT_EVENTS_SEGMENT_CHUNK_SIZE') ??
      this.readNumberFromEnv('TRANSCRIPT_ANALYSIS_CHUNK_SIZE') ??
      this.readNumberFromEnv('TRANSCRIPT_ANALYSIS_WINDOW_SIZE') ??
      this.readNumberFromEnv('TRANSCRIPT_EVENTS_SEGMENT_WINDOW_EVENTS') ??
      120

    const intervalMs = this.readNumberFromEnv('TRANSCRIPT_EVENTS_SEGMENT_INTERVAL_MS') ?? 3000

    const model =
      (this.configService.get<string>('GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL') || '').trim()

    const maxTokens =
      this.readNumberFromEnv('GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS') ?? 2000

    const jsonMode = this.readBooleanFromEnv('GLM_TRANSCRIPT_EVENT_SEGMENT_JSON_MODE', true)

    return {
      systemPrompt: DEFAULT_SEGMENTATION_SYSTEM_PROMPT,
      strictSystemPrompt: DEFAULT_SEGMENTATION_STRICT_SYSTEM_PROMPT,
      windowEvents: this.normalizeInt(windowEvents, 120, WINDOW_EVENTS_MIN, WINDOW_EVENTS_MAX),
      intervalMs: this.normalizeInt(intervalMs, 3000, 0, INTERVAL_MS_MAX),
      triggerOnEndTurn: this.readBooleanFromEnv(
        'TRANSCRIPT_EVENTS_SEGMENT_TRIGGER_ON_END_TURN',
        true
      ),
      triggerOnStopTranscribe: this.readBooleanFromEnv(
        'TRANSCRIPT_EVENTS_SEGMENT_TRIGGER_ON_STOP_TRANSCRIBE',
        true
      ),
      model: this.normalizeText(model, ''),
      maxTokens: this.normalizeInt(maxTokens, 2000, MAX_TOKENS_MIN, MAX_TOKENS_MAX),
      jsonMode,
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
      triggerOnEndTurn: this.normalizeBoolean(input.triggerOnEndTurn, base.triggerOnEndTurn),
      triggerOnStopTranscribe: this.normalizeBoolean(
        input.triggerOnStopTranscribe,
        base.triggerOnStopTranscribe
      ),
      model: this.normalizeText(input.model, base.model),
      maxTokens: this.normalizeInt(
        input.maxTokens,
        base.maxTokens,
        MAX_TOKENS_MIN,
        MAX_TOKENS_MAX
      ),
      jsonMode: this.normalizeBoolean(input.jsonMode, base.jsonMode),
    }
  }

  private readNumberFromEnv(key: string): number | undefined {
    const raw =
      this.configService.get<string>(key) ||
      process.env[key]
    if (!raw) return undefined
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }

  private readBooleanFromEnv(key: string, fallback: boolean): boolean {
    const raw =
      this.configService.get<string>(key) ||
      process.env[key]
    if (raw == null || raw === '') return fallback
    const normalized = String(raw).trim().toLowerCase()
    if (normalized === '0' || normalized === 'false') return false
    if (normalized === '1' || normalized === 'true') return true
    return fallback
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
