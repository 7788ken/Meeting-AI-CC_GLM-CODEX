import { Injectable, Logger } from '@nestjs/common'
import type { AsrConfigDto } from './dto/transcript.dto'

type BufferState = {
  config: AsrConfigDto
  chunks: Buffer[]
  totalBytes: number
}

@Injectable()
export class AudioBufferService {
  private readonly logger = new Logger(AudioBufferService.name)
  private readonly states = new Map<string, BufferState>()
  private readonly bytesPerMs = (16000 * 16 * 1) / 8 / 1000

  getConfig(clientId: string): AsrConfigDto {
    return { ...this.ensureState(clientId).config }
  }

  updateConfig(clientId: string, next?: Partial<AsrConfigDto>): AsrConfigDto {
    const state = this.ensureState(clientId)
    state.config = this.normalizeConfig({ ...state.config, ...next })
    return { ...state.config }
  }

  appendAudio(
    clientId: string,
    chunk: Buffer
  ): { buffer: Buffer | null; durationMs: number; config: AsrConfigDto } {
    const state = this.ensureState(clientId)

    if (chunk.length > 0) {
      state.chunks.push(chunk)
      state.totalBytes += chunk.length
    }

    const durationMs = this.bytesToMs(state.totalBytes)
    const shouldFlush =
      durationMs >= state.config.bufferDurationMs && durationMs >= state.config.minAudioLengthMs

    if (!shouldFlush) {
      return { buffer: null, durationMs, config: { ...state.config } }
    }

    const buffer = Buffer.concat(state.chunks, state.totalBytes)
    state.chunks = []
    state.totalBytes = 0

    return { buffer, durationMs, config: { ...state.config } }
  }

  flush(
    clientId: string,
    options?: { force?: boolean }
  ): { buffer: Buffer | null; durationMs: number; config: AsrConfigDto } {
    const state = this.states.get(clientId)
    if (!state || state.totalBytes === 0) {
      return { buffer: null, durationMs: 0, config: { ...this.defaultConfig } }
    }

    const durationMs = this.bytesToMs(state.totalBytes)
    const shouldSend = options?.force === true || durationMs >= state.config.minAudioLengthMs
    const buffer = shouldSend ? Buffer.concat(state.chunks, state.totalBytes) : null

    state.chunks = []
    state.totalBytes = 0

    return { buffer, durationMs, config: { ...state.config } }
  }

  clear(clientId: string): void {
    this.states.delete(clientId)
  }

  private ensureState(clientId: string): BufferState {
    const existing = this.states.get(clientId)
    if (existing) return existing

    const created: BufferState = {
      config: { ...this.defaultConfig },
      chunks: [],
      totalBytes: 0,
    }
    this.states.set(clientId, created)
    return created
  }

  private bytesToMs(bytes: number): number {
    return Math.floor(bytes / this.bytesPerMs)
  }

  private get defaultConfig(): AsrConfigDto {
    return {
      bufferDurationMs: 3000,
      minAudioLengthMs: 500,
      language: 'zh',
    }
  }

  private normalizeConfig(input: Partial<AsrConfigDto>): AsrConfigDto {
    const bufferDurationMs = this.clampNumber(input.bufferDurationMs, 1000, 10000, 3000)
    const minAudioLengthMs = this.clampNumber(
      input.minAudioLengthMs,
      0,
      Number.MAX_SAFE_INTEGER,
      500
    )
    const language = this.normalizeLanguage(input.language)
    const hotwords = this.normalizeHotwords(input.hotwords)
    const prompt = this.normalizePrompt(input.prompt)

    return {
      bufferDurationMs,
      minAudioLengthMs,
      language,
      hotwords,
      prompt,
    }
  }

  private clampNumber(
    value: number | undefined,
    min: number,
    max: number,
    fallback: number
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback
    }
    return Math.min(Math.max(value, min), max)
  }

  private normalizeLanguage(value?: string): string {
    if (!value) return 'zh'
    const normalized = value.trim().toLowerCase()
    if (normalized === 'zh-cn' || normalized === 'zh_cn' || normalized === 'zh-hans') {
      return 'zh'
    }
    if (
      normalized === 'zh' ||
      normalized === 'en' ||
      normalized === 'yue' ||
      normalized === 'auto'
    ) {
      return normalized
    }
    this.logger.warn(`Unsupported ASR language: ${value}, fallback to zh`)
    return 'zh'
  }

  private normalizeHotwords(hotwords?: string[]): string[] | undefined {
    if (!Array.isArray(hotwords)) return undefined
    const normalized = hotwords
      .map(word => (typeof word === 'string' ? word.trim() : ''))
      .filter(word => word)
    return normalized.length > 0 ? normalized : undefined
  }

  private normalizePrompt(prompt?: string): string | undefined {
    if (typeof prompt !== 'string') return undefined
    const normalized = prompt.trim()
    return normalized ? normalized : undefined
  }
}
