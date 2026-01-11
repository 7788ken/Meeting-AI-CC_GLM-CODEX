import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TranscriptResultDto } from './dto/transcript.dto'
import { DoubaoClientManager } from './doubao.client'
import { DoubaoDecodedMessage } from './doubao.codec'

// Socket.IO 的 Socket 类型（使用 any 简化类型）
type Socket = any

type TranscriptProcessOptions = {
  /**
   * 默认保持“吞掉错误并返回 null”的行为，避免影响 socket.io gateway。
   * 原生 WebSocket 需要把错误回传给前端时，将其设为 true 让上层捕获并发送 error 消息。
   */
  propagateError?: boolean
}

@Injectable()
export class TranscriptService {
  // 客户端映射
  private clients: Map<string, Socket> = new Map()

  private readonly logger = new Logger(TranscriptService.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly doubaoClientManager: DoubaoClientManager
  ) {}

  addClient(clientId: string, socket: any) {
    this.clients.set(clientId, socket)
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId)
    void this.doubaoClientManager.close(clientId)
  }

  async processAudio(
    clientId: string,
    audioData: string,
    sessionId: string,
    isFinal = false,
    options?: TranscriptProcessOptions
  ): Promise<TranscriptResultDto | null> {
    try {
      const client = this.doubaoClientManager.getOrCreate(clientId, sessionId)
      const audioBuffer = this.decodeAudioData(audioData)

      if (!audioBuffer.length && !isFinal) {
        this.logger.warn(`Empty audio data, clientId=${clientId}`)
        return null
      }

      await client.sendAudio(audioBuffer, isFinal)

      const response = await client.nextResponse(this.getResponseTimeoutMs())
      if (!response) {
        this.logger.debug(`No response within timeout, clientId=${clientId}`)
        return null
      }

      return this.buildTranscriptResult(response, sessionId, clientId)
    } catch (error) {
      this.logger.error(
        `Doubao ASR failed, clientId=${clientId}`,
        error instanceof Error ? error.stack : String(error)
      )
      if (options?.propagateError) {
        throw error instanceof Error ? error : new Error(String(error))
      }
      return null
    } finally {
      if (isFinal) {
        await this.doubaoClientManager.close(clientId)
      }
    }
  }

  /**
   * 处理二进制音频数据 (原生 WebSocket)
   * 前端发送的是 PCM 16-bit Int16Array 数据
   */
  async processBinaryAudio(
    clientId: string,
    audioBuffer: Buffer,
    sessionId: string,
    options?: TranscriptProcessOptions
  ): Promise<TranscriptResultDto | null> {
    try {
      const client = this.doubaoClientManager.getOrCreate(clientId, sessionId)

      if (!audioBuffer.length) {
        this.logger.debug(`Empty binary audio data, clientId=${clientId}`)
        return null
      }

      // 直接发送 PCM 数据到豆包 ASR
      await client.sendAudio(audioBuffer, false)

      const response = await client.nextResponse(this.getResponseTimeoutMs())
      if (!response) {
        this.logger.debug(`No response within timeout, clientId=${clientId}`)
        return null
      }

      return this.buildTranscriptResult(response, sessionId, clientId)
    } catch (error) {
      this.logger.error(
        `Doubao ASR binary failed, clientId=${clientId}`,
        error instanceof Error ? error.stack : String(error)
      )
      if (options?.propagateError) {
        throw error instanceof Error ? error : new Error(String(error))
      }
      return null
    }
  }

  /**
   * 结束音频并尝试拉取最终转写结果（原生 WebSocket 使用）。
   */
  async finalizeAudio(
    clientId: string,
    sessionId: string,
    options?: TranscriptProcessOptions
  ): Promise<TranscriptResultDto | null> {
    const client = this.doubaoClientManager.get(clientId)
    if (!client) {
      return null
    }

    try {
      await client.sendAudio(Buffer.alloc(0), true)

      const response = await client.nextResponse(this.getResponseTimeoutMs())
      if (!response) {
        return null
      }

      return this.buildTranscriptResult(response, sessionId, clientId)
    } catch (error) {
      this.logger.error(
        `Doubao endAudio failed, clientId=${clientId}`,
        error instanceof Error ? error.stack : String(error)
      )
      if (options?.propagateError) {
        throw error instanceof Error ? error : new Error(String(error))
      }
      return null
    } finally {
      await this.doubaoClientManager.close(clientId)
    }
  }

  async endAudio(clientId: string): Promise<void> {
    const client = this.doubaoClientManager.get(clientId)
    if (!client) {
      return
    }

    try {
      await client.sendAudio(Buffer.alloc(0), true)
    } catch (error) {
      this.logger.error(
        `Doubao endAudio failed, clientId=${clientId}`,
        error instanceof Error ? error.stack : String(error)
      )
    } finally {
      await this.doubaoClientManager.close(clientId)
    }
  }

  private decodeAudioData(audioData: string): Buffer {
    if (!audioData) {
      return Buffer.alloc(0)
    }

    const base64 = audioData.includes(',') ? (audioData.split(',').pop() ?? '') : audioData
    try {
      return Buffer.from(base64, 'base64')
    } catch {
      this.logger.warn('Invalid base64 audio data')
      return Buffer.alloc(0)
    }
  }

  private getResponseTimeoutMs(): number {
    const rawValue = this.configService.get<string>('TRANSCRIPT_RESPONSE_TIMEOUT_MS')
    const value = Number(rawValue)
    return Number.isFinite(value) && value > 0 ? value : 5000
  }

  private buildTranscriptResult(
    message: DoubaoDecodedMessage,
    sessionId: string,
    clientId: string
  ): TranscriptResultDto | null {
    if (!message.payload) {
      return null
    }

    const payload = message.payload as Record<string, unknown>
    const utteranceSegment = this.extractUtteranceSegment(payload)
    const content = utteranceSegment?.content ?? this.extractText(payload)
    if (!content) return null

    const { speakerId, speakerName } = utteranceSegment
      ? this.extractSpeakerFromRecord(utteranceSegment.record, clientId)
      : this.extractSpeaker(payload, clientId)

    if (utteranceSegment && this.shouldLogUtterances()) {
      const recordKeys = Object.keys(utteranceSegment.record).slice(0, 24).join(',')
      this.logger.debug(
        [
          'Doubao utterances',
          `len=${utteranceSegment.utterancesLength}`,
          utteranceSegment.segmentKey ? `segmentKey=${utteranceSegment.segmentKey}` : null,
          `speakerId=${speakerId}`,
          `textLen=${utteranceSegment.content.length}`,
          `preview=${utteranceSegment.content.slice(0, 20)}`,
          recordKeys ? `keys=${recordKeys}` : null,
        ]
          .filter(Boolean)
          .join(' ')
      )
    }

    return {
      id: this.generateId(),
      sessionId,
      segmentKey: utteranceSegment?.segmentKey,
      speakerId,
      speakerName,
      content,
      isFinal: utteranceSegment?.isFinal ?? this.extractIsFinal(payload),
      confidence: utteranceSegment?.confidence ?? this.extractConfidence(payload),
    }
  }

  /**
   * 当 show_utterances 开启时，豆包可能在 utterances 内提供分句信息（有时也包含 speaker 信息）。
   * 这里优先提取“最后一条 utterance”作为当前段落内容，并给出 segmentKey 用于后端切段。
   */
  private extractUtteranceSegment(
    payload: Record<string, unknown>
  ): {
    content: string
    record: Record<string, unknown>
    utterancesLength: number
    segmentKey?: string
    isFinal?: boolean
    confidence?: number
  } | null {
    const result = (payload.result ?? payload.data ?? payload) as Record<string, unknown>
    const utterances = result?.utterances as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(utterances) || utterances.length === 0) {
      return null
    }

    const last = this.findLastNonEmptyUtterance(utterances)
    if (!last) {
      return null
    }

    const content = this.readUtteranceText(last)

    if (!content) {
      return null
    }

    const utteranceKey = this.readUtteranceKey(result, utterances, last)
    if (!utteranceKey) {
      return null
    }

    if (utterances.length === 1 && utteranceKey.source === 'index') {
      // utterances 只返回单条且缺少可稳定识别的 key 时，不切换为“按 utterance 返回”，避免覆盖历史内容
      return null
    }

    return {
      content,
      record: last,
      utterancesLength: utterances.length,
      segmentKey: utteranceKey.key,
      isFinal: this.extractIsFinalFromRecord(last),
      confidence: this.extractConfidenceFromRecord(last),
    }
  }

  private shouldLogUtterances(): boolean {
    return process.env.TRANSCRIPT_DEBUG_LOG_UTTERANCES === '1' && process.env.NODE_ENV !== 'production'
  }

  private findLastNonEmptyUtterance(
    utterances: Array<Record<string, unknown>>
  ): Record<string, unknown> | null {
    for (let index = utterances.length - 1; index >= 0; index -= 1) {
      const item = utterances[index]
      const text = this.readUtteranceText(item)
      if (text.length > 0) return item
    }
    return null
  }

  private readUtteranceKey(
    result: Record<string, unknown>,
    utterances: Array<Record<string, unknown>>,
    record: Record<string, unknown>
  ): { key: string; source: 'record' | 'result' | 'index' } | null {
    const readScalar = (value: unknown): string | undefined => {
      if (typeof value === 'string') return value
      if (typeof value === 'number') return String(value)
      return undefined
    }

    // 优先选择“稳定字段”作为切段键：utteranceId / startTime（避免使用 seq/id 这类可能每帧变化的字段导致过度切段）
    const recordCandidates = [
      readScalar(record.utterance_id),
      readScalar(record.utteranceId),
      readScalar(record.utt_id),
      readScalar(record.uttId),
      readScalar(record.start_time),
      readScalar(record.startTime),
      readScalar(record.begin_time),
      readScalar(record.beginTime),
      readScalar(record.index),
    ].filter(Boolean) as string[]

    if (recordCandidates.length > 0) {
      const speakerId = this.readSpeakerId(record)
      const key = speakerId ? `${String(speakerId)}:${recordCandidates[0]}` : recordCandidates[0]
      return { key, source: 'record' }
    }

    const resultCandidates = [
      readScalar((result as any).payload_sequence),
      readScalar((result as any).payloadSequence),
    ].filter(Boolean) as string[]

    if (resultCandidates.length > 0) {
      return { key: resultCandidates[0], source: 'result' }
    }

    // 兜底：若 utterances 为累积数组，则最后一项的下标可作为稳定切段键
    const index = utterances.lastIndexOf(record)
    if (index >= 0) {
      return { key: `u${index}`, source: 'index' }
    }

    return null
  }

  private readUtteranceText(record: Record<string, unknown>): string {
    if (typeof record.text === 'string') return record.text
    if (typeof record.sentence === 'string') return record.sentence
    return ''
  }

  private extractIsFinalFromRecord(record: Record<string, unknown>): boolean | undefined {
    if (typeof record.is_final === 'boolean') return record.is_final
    if (typeof record.isFinal === 'boolean') return record.isFinal
    if (typeof record.final === 'boolean') return record.final
    return undefined
  }

  private extractConfidenceFromRecord(record: Record<string, unknown>): number | undefined {
    const raw = record.confidence
    if (raw == null) return undefined
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }

  private readSpeakerId(record: Record<string, unknown>): string | number | null {
    if (typeof record.speaker_id === 'string' || typeof record.speaker_id === 'number') {
      return record.speaker_id
    }
    if (typeof record.speakerId === 'string' || typeof record.speakerId === 'number') {
      return record.speakerId
    }

    const speaker = record.speaker as Record<string, unknown> | undefined
    if (speaker) {
      const raw = speaker.id
      if (typeof raw === 'string' || typeof raw === 'number') return raw
    }

    return null
  }

  private extractSpeakerFromRecord(
    record: Record<string, unknown>,
    clientId: string
  ): { speakerId: string; speakerName: string } {
    const rawId = this.readSpeakerId(record)
    const speakerId = rawId != null ? String(rawId) : `client_${clientId}`

    const rawName =
      (typeof record.speaker_name === 'string' ? record.speaker_name : undefined) ??
      (typeof record.speakerName === 'string' ? record.speakerName : undefined) ??
      ((record.speaker as Record<string, unknown> | undefined)?.name as string | undefined)

    const speakerName = rawName?.trim?.() ? rawName.trim() : '发言者'

    return { speakerId, speakerName }
  }

  private extractText(payload: Record<string, unknown>): string | null {
    const result = (payload.result ?? payload.data ?? payload) as Record<string, unknown>

    if (typeof result?.text === 'string') {
      return result.text
    }

    if (typeof payload === 'string') {
      return payload
    }

    const utterances = result?.utterances as Array<Record<string, unknown>> | undefined
    if (Array.isArray(utterances)) {
      const text = utterances
        .map(item => (typeof item?.text === 'string' ? item.text : ''))
        .filter(value => value.length > 0)
        .join('')
      return text || null
    }

    if (typeof result?.sentence === 'string') {
      return result.sentence
    }

    return null
  }

  private extractIsFinal(payload: Record<string, unknown>): boolean {
    const result = (payload.result ?? payload.data ?? payload) as Record<string, unknown>
    return Boolean(result?.is_final ?? result?.isFinal ?? payload?.is_final ?? payload?.isFinal)
  }

  private extractConfidence(payload: Record<string, unknown>): number {
    const result = (payload.result ?? payload.data ?? payload) as Record<string, unknown>
    const value = Number(result?.confidence ?? payload?.confidence ?? 1)
    return Number.isFinite(value) ? value : 1
  }

  private extractSpeaker(
    payload: Record<string, unknown>,
    clientId: string
  ): { speakerId: string; speakerName: string } {
    const result = (payload.result ?? payload.data ?? payload) as Record<string, unknown>
    const speakerId =
      (result?.speaker_id as string | undefined) ??
      (result?.speaker as Record<string, unknown> | undefined)?.id?.toString() ??
      `client_${clientId}`
    const speakerName =
      (result?.speaker_name as string | undefined) ??
      (result?.speaker as Record<string, unknown> | undefined)?.name?.toString() ??
      '发言者'

    return { speakerId, speakerName }
  }

  private generateId(): string {
    return `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}
