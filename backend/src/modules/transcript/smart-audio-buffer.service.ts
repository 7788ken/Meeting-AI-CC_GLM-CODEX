import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AsrConfigDto } from './dto/transcript.dto'

interface SmartBufferState {
  config: AsrConfigDto
  chunks: Buffer[]
  totalBytes: number
  trailingSilenceMs: number
  hasSpeech: boolean
}

interface FlushResult {
  buffer: Buffer | null
  durationMs: number
  reason: 'silence' | 'max_duration' | 'manual' | 'insufficient_audio'
  config: AsrConfigDto
}

@Injectable()
export class SmartAudioBufferService {
  private readonly logger = new Logger(SmartAudioBufferService.name)
  private readonly states = new Map<string, SmartBufferState>()

  // 音频参数：16kHz, 16-bit, 1 channel
  private readonly bytesPerMs = (16000 * 16 * 1) / 8 / 1000

  // VAD 参数
  private readonly DEFAULT_ENERGY_THRESHOLD = 0.02
  private readonly DEFAULT_SILENCE_THRESHOLD_MS = 500
  private readonly DEFAULT_SOFT_MAX_BUFFER_DURATION_MS = 30000
  private readonly DEFAULT_HARD_MAX_BUFFER_DURATION_MS = 50000
  private readonly DEFAULT_MIN_SPEECH_DURATION_MS = 200

  constructor(private readonly configService: ConfigService) {}

  getConfig(clientId: string): AsrConfigDto {
    return { ...this.ensureState(clientId).config }
  }

  updateConfig(clientId: string, next?: Partial<AsrConfigDto>): AsrConfigDto {
    const state = this.ensureState(clientId)
    state.config = this.normalizeConfig({ ...state.config, ...next })
    this.resetState(state)
    return { ...state.config }
  }

  appendAudio(clientId: string, chunk: Buffer): FlushResult {
    const state = this.ensureState(clientId)

    this.logger.debug(
      `[AudioBuffer] clientId=${clientId}, chunkSize=${chunk.length}, ` +
        `totalBytes=${state.totalBytes + chunk.length}, trailingSilence=${state.trailingSilenceMs}ms`
    )

    if (chunk.length === 0) {
      return {
        buffer: null,
        durationMs: this.bytesToMs(state.totalBytes),
        reason: 'insufficient_audio',
        config: { ...state.config },
      }
    }

    state.chunks.push(chunk)
    state.totalBytes += chunk.length

    const durationMs = this.bytesToMs(state.totalBytes)
    const minAudioLengthMs = this.getMinAudioLengthMs(state)
    const energy = this.calculateEnergy(chunk)
    const speechDetected = this.detectSpeech(chunk, energy)

    if (speechDetected) {
      state.hasSpeech = true
    }

    this.updateTrailingSilence(state, chunk)

    this.logger.debug(
      `[AudioBuffer] clientId=${clientId}, energy=${energy.toFixed(4)}, ` +
        `hasSpeech=${state.hasSpeech}, trailingSilence=${state.trailingSilenceMs}ms, ` +
        `threshold=${this.DEFAULT_SILENCE_THRESHOLD_MS}ms`
    )

    const maxFlushMs = this.getMaxDurationFlushMs(state, durationMs)
    if (maxFlushMs) {
      this.logger.log(
        `[AudioBuffer] FLUSH by max_duration: clientId=${clientId}, ` +
          `durationMs=${durationMs}ms >= ${maxFlushMs}ms`
      )
      return this.flushByMaxDuration(clientId, state, maxFlushMs)
    }

    if (this.shouldFlushBySilence(state, minAudioLengthMs)) {
      this.logger.log(
        `[AudioBuffer] FLUSH by silence: clientId=${clientId}, ` +
          `trailingSilence=${state.trailingSilenceMs}ms >= ${this.DEFAULT_SILENCE_THRESHOLD_MS}ms, ` +
          `durationMs=${durationMs}ms`
      )
      return this.buildFlushResult(clientId, state, durationMs, 'silence')
    }

    this.logger.debug(
      `[AudioBuffer] ⏳ ACCUMULATING: clientId=${clientId}, ` +
        `durationMs=${durationMs}ms, trailingSilence=${state.trailingSilenceMs}ms, ` +
        `hasSpeech=${state.hasSpeech}`
    )

    return { buffer: null, durationMs, reason: 'insufficient_audio', config: { ...state.config } }
  }

  flush(clientId: string, options?: { force?: boolean }): FlushResult {
    const state = this.states.get(clientId)
    if (!state) {
      return { buffer: null, durationMs: 0, reason: 'insufficient_audio', config: { ...this.defaultConfig } }
    }

    const durationMs = this.bytesToMs(state.totalBytes)
    return this.buildFlushResult(clientId, state, durationMs, 'manual', options)
  }

  clear(clientId: string): void {
    this.states.delete(clientId)
  }

  private ensureState(clientId: string): SmartBufferState {
    const existing = this.states.get(clientId)
    if (existing) return existing

    const created: SmartBufferState = {
      config: { ...this.defaultConfig },
      chunks: [],
      totalBytes: 0,
      trailingSilenceMs: 0,
      hasSpeech: false,
    }
    this.states.set(clientId, created)
    return created
  }

  private resetState(state: SmartBufferState): void {
    state.chunks = []
    state.totalBytes = 0
    state.trailingSilenceMs = 0
    state.hasSpeech = false
  }

  private bytesToMs(bytes: number): number {
    return Math.floor(bytes / this.bytesPerMs)
  }

  private calculateEnergy(buffer: Buffer): number {
    if (buffer.length < 2) {
      return 0
    }

    const sampleCount = Math.floor(buffer.length / 2)
    if (sampleCount === 0) {
      return 0
    }

    const int16Array = new Int16Array(buffer.buffer, buffer.byteOffset, sampleCount)
    let sum = 0
    for (let i = 0; i < int16Array.length; i += 1) {
      const normalized = int16Array[i] / 32768
      sum += normalized * normalized
    }

    return Math.sqrt(sum / sampleCount)
  }

  private detectSpeech(buffer: Buffer, energy?: number): boolean {
    const currentEnergy = energy ?? this.calculateEnergy(buffer)
    if (currentEnergy <= this.DEFAULT_ENERGY_THRESHOLD) {
      return false
    }

    return true
  }

  /**
   * 计算音频块末尾的静音时长（毫秒）
   * 从音频末尾向前遍历，找到能量低于阈值的部分
   */
  private calculateTrailingSilence(buffer: Buffer): number {
    if (buffer.length < 2) {
      return 0
    }

    const sampleCount = Math.floor(buffer.length / 2)
    if (sampleCount === 0) {
      return 0
    }

    const int16Array = new Int16Array(buffer.buffer, buffer.byteOffset, sampleCount)
    let silenceSamples = 0

    for (let i = int16Array.length - 1; i >= 0; i -= 1) {
      const normalized = Math.abs(int16Array[i] / 32768)
      if (normalized > this.DEFAULT_ENERGY_THRESHOLD) {
        break
      }
      silenceSamples += 1
    }

    return Math.floor((silenceSamples / 16000) * 1000)
  }

  /**
   * 追加音频后更新末尾静音时长
   * 如果新块有声音，重置为块内末尾静音；否则累加静音时长
   */
  private updateTrailingSilence(state: SmartBufferState, newChunk: Buffer): void {
    const chunkDurationMs = this.bytesToMs(newChunk.length)
    if (chunkDurationMs === 0) {
      return
    }

    const chunkTrailingSilenceMs = this.calculateTrailingSilence(newChunk)
    if (chunkTrailingSilenceMs >= chunkDurationMs) {
      state.trailingSilenceMs += chunkDurationMs
      return
    }

    state.trailingSilenceMs = chunkTrailingSilenceMs
  }

  private shouldFlushBySilence(state: SmartBufferState, minAudioLengthMs: number): boolean {
    if (!state.hasSpeech) {
      return false
    }

    const durationMs = this.bytesToMs(state.totalBytes)
    if (durationMs < minAudioLengthMs) {
      return false
    }

    return state.trailingSilenceMs >= this.DEFAULT_SILENCE_THRESHOLD_MS
  }

  private getMaxDurationFlushMs(state: SmartBufferState, durationMs: number): number | null {
    if (state.totalBytes === 0) {
      return null
    }
    const softMaxMs = this.readSoftMaxDurationMs()
    const hardMaxMs = this.readHardMaxDurationMs(softMaxMs)

    if (durationMs >= hardMaxMs) {
      return hardMaxMs
    }
    if (durationMs >= softMaxMs && state.trailingSilenceMs >= this.DEFAULT_SILENCE_THRESHOLD_MS) {
      return softMaxMs
    }

    return null
  }

  private flushByMaxDuration(
    clientId: string,
    state: SmartBufferState,
    maxDurationMs: number
  ): FlushResult {
    const maxBytes = Math.floor(this.bytesPerMs * maxDurationMs)
    const totalBytes = state.totalBytes
    const chunks = state.chunks

    if (!chunks.length || totalBytes <= 0) {
      return { buffer: null, durationMs: 0, reason: 'insufficient_audio', config: { ...state.config } }
    }

    let remainingBytes = maxBytes
    const headChunks: Buffer[] = []
    const tailChunks: Buffer[] = []

    for (const chunk of chunks) {
      if (remainingBytes <= 0) {
        tailChunks.push(chunk)
        continue
      }

      if (chunk.length <= remainingBytes) {
        headChunks.push(chunk)
        remainingBytes -= chunk.length
        continue
      }

      headChunks.push(chunk.subarray(0, remainingBytes))
      tailChunks.push(chunk.subarray(remainingBytes))
      remainingBytes = 0
    }

    const flushedBytes = maxBytes - remainingBytes
    const buffer = flushedBytes > 0 ? Buffer.concat(headChunks, flushedBytes) : null
    const flushedDurationMs = this.bytesToMs(flushedBytes)
    const minAudioLengthMs = this.getMinAudioLengthMs(state)
    const shouldSend = state.hasSpeech && flushedDurationMs >= minAudioLengthMs && buffer

    if (!shouldSend) {
      this.resetState(state)
      return {
        buffer: null,
        durationMs: flushedDurationMs,
        reason: 'insufficient_audio',
        config: { ...state.config },
      }
    }

    this.rebuildStateAfterSplit(state, tailChunks)

    if (buffer) {
      this.logger.warn(
        `[AudioBuffer] ✅ FLUSH SUCCESS: clientId=${clientId}, reason=max_duration, ` +
          `durationMs=${flushedDurationMs}ms, bytes=${flushedBytes}, ` +
          `remainingBytes=${state.totalBytes}`
      )
    }

    return {
      buffer,
      durationMs: flushedDurationMs,
      reason: buffer ? 'max_duration' : 'insufficient_audio',
      config: { ...state.config },
    }
  }

  private readSoftMaxDurationMs(): number {
    const raw =
      this.configService.get<string>('TRANSCRIPT_MAX_BUFFER_DURATION_SOFT_MS') ||
      process.env.TRANSCRIPT_MAX_BUFFER_DURATION_SOFT_MS
    const value = Number(raw)
    if (!Number.isFinite(value)) return this.DEFAULT_SOFT_MAX_BUFFER_DURATION_MS
    return this.clampNumber(value, 5000, 59000, this.DEFAULT_SOFT_MAX_BUFFER_DURATION_MS)
  }

  private readHardMaxDurationMs(softMaxMs: number): number {
    const raw =
      this.configService.get<string>('TRANSCRIPT_MAX_BUFFER_DURATION_HARD_MS') ||
      process.env.TRANSCRIPT_MAX_BUFFER_DURATION_HARD_MS
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      return Math.max(softMaxMs, this.DEFAULT_HARD_MAX_BUFFER_DURATION_MS)
    }
    const normalized = this.clampNumber(value, softMaxMs, 59000, this.DEFAULT_HARD_MAX_BUFFER_DURATION_MS)
    return Math.max(softMaxMs, normalized)
  }

  private buildFlushResult(
    clientId: string,
    state: SmartBufferState,
    durationMs: number,
    reason: 'silence' | 'max_duration' | 'manual',
    options?: { force?: boolean }
  ): FlushResult {
    const shouldSend =
      state.totalBytes > 0 &&
      (options?.force === true || (state.hasSpeech && durationMs >= this.getMinAudioLengthMs(state)))

    const buffer = shouldSend ? Buffer.concat(state.chunks, state.totalBytes) : null
    const resultReason = shouldSend ? reason : 'insufficient_audio'
    const chunksCount = state.chunks.length
    const totalBytes = state.totalBytes
    const hasSpeech = state.hasSpeech

    this.resetState(state)

    if (buffer) {
      this.logger.warn(
        `[AudioBuffer] ✅ FLUSH SUCCESS: clientId=${clientId}, reason=${resultReason}, ` +
          `durationMs=${durationMs}ms, chunks=${chunksCount}, bytes=${totalBytes}, ` +
          `force=${options?.force === true}`
      )
    } else {
      this.logger.debug(
        `[AudioBuffer] ❌ FLUSH SKIPPED: clientId=${clientId}, ` +
          `hasSpeech=${hasSpeech}, durationMs=${durationMs}ms, ` +
          `minRequired=${this.getMinAudioLengthMs(state)}ms`
      )
    }

    return {
      buffer,
      durationMs,
      reason: resultReason,
      config: { ...state.config },
    }
  }

  private rebuildStateAfterSplit(state: SmartBufferState, remainingChunks: Buffer[]): void {
    state.chunks = remainingChunks
    state.totalBytes = remainingChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    state.hasSpeech = this.detectSpeechInChunks(remainingChunks)
    state.trailingSilenceMs = this.calculateTrailingSilenceFromChunks(remainingChunks)
  }

  private detectSpeechInChunks(chunks: Buffer[]): boolean {
    for (const chunk of chunks) {
      if (this.calculateEnergy(chunk) > this.DEFAULT_ENERGY_THRESHOLD) {
        return true
      }
    }
    return false
  }

  private calculateTrailingSilenceFromChunks(chunks: Buffer[]): number {
    if (!chunks.length) return 0

    let totalSilenceMs = 0
    for (let idx = chunks.length - 1; idx >= 0; idx -= 1) {
      const chunk = chunks[idx]
      const chunkDurationMs = this.bytesToMs(chunk.length)
      const chunkTrailingSilenceMs = this.calculateTrailingSilence(chunk)
      if (chunkTrailingSilenceMs >= chunkDurationMs) {
        totalSilenceMs += chunkDurationMs
        continue
      }
      totalSilenceMs += chunkTrailingSilenceMs
      break
    }
    return totalSilenceMs
  }

  private get defaultConfig(): AsrConfigDto {
    return {
      bufferDurationMs: 3000,
      minAudioLengthMs: 500,
      language: 'zh',
    }
  }

  private getMinAudioLengthMs(state: SmartBufferState): number {
    const value = Number(state.config.minAudioLengthMs)
    if (Number.isFinite(value) && value >= 0) {
      return value
    }
    return this.DEFAULT_MIN_SPEECH_DURATION_MS
  }

  private normalizeConfig(input: Partial<AsrConfigDto>): AsrConfigDto {
    const bufferDurationMs = this.clampNumber(input.bufferDurationMs, 1000, 10000, 3000)
    const minAudioLengthMs = this.clampNumber(input.minAudioLengthMs, 0, Number.MAX_SAFE_INTEGER, 500)
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
    if (normalized === 'zh' || normalized === 'en' || normalized === 'yue' || normalized === 'auto') {
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
