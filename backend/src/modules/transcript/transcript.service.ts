import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TranscriptResultDto } from './dto/transcript.dto'
import { DoubaoClientManager } from './doubao.client'
import { DoubaoDecodedMessage } from './doubao.codec'
import { SmartAudioBufferService } from './smart-audio-buffer.service'

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
    private readonly doubaoClientManager: DoubaoClientManager,
    private readonly smartAudioBufferService: SmartAudioBufferService
  ) {}

  addClient(clientId: string, socket: any) {
    this.clients.set(clientId, socket)
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId)
    this.smartAudioBufferService.clear(clientId)
    void this.doubaoClientManager.close(clientId)
  }

  async processAudioWithBuffer(
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

      const appended = this.smartAudioBufferService.appendAudio(clientId, audioBuffer)
      let bufferToSend = appended.buffer
      let reason = appended.reason
      let durationMs = appended.durationMs
      let sendFinal = false

      if (isFinal) {
        if (!bufferToSend) {
          const flushed = this.smartAudioBufferService.flush(clientId)
          bufferToSend = flushed.buffer
          reason = flushed.reason
          durationMs = flushed.durationMs
        }
        sendFinal = true
      }

      if (!bufferToSend && !sendFinal) {
        return null
      }

      if (bufferToSend && reason !== 'insufficient_audio') {
        this.logger.debug(
          `ASR flush trigger: clientId=${clientId}, reason=${reason}, durationMs=${durationMs}`
        )
      }

      await client.sendAudio(bufferToSend ?? Buffer.alloc(0), sendFinal)

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
      const appended = this.smartAudioBufferService.appendAudio(clientId, audioBuffer)

      if (!appended.buffer) {
        return null
      }

      this.logger.debug(
        `ASR flush trigger: clientId=${clientId}, reason=${appended.reason}, durationMs=${appended.durationMs}`
      )

      const client = this.doubaoClientManager.getOrCreate(clientId, sessionId)
      await client.sendAudio(appended.buffer, false)

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
   *
   * 注意：豆包 ASR 在流式处理过程中持续返回结果，最后一条就是"最终结果"。
   * 发送结束信号后，豆包不会返回额外的确认响应。
   * 因此这里尝试获取新响应，如果没有则使用最后收到的响应。
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
      // 先保存可能存在的最后响应（在发送结束信号前）
      const lastResponseBeforeEnd = (client as any).getLastResponse
        ? (client as any).getLastResponse()
        : null

      await client.sendAudio(Buffer.alloc(0), true)

      // 尝试获取结束后的响应（有些 ASR 可能会返回最终确认）
      const response = await client.nextResponse(this.getResponseTimeoutMs())

      // 使用新响应，如果没有则使用之前的最后响应
      const finalResponse = response ?? lastResponseBeforeEnd

      if (!finalResponse) {
        this.logger.warn(
          `finalizeAudio: no response available (before or after end signal), clientId=${clientId}`
        )
        return null
      }

      const result = this.buildTranscriptResult(finalResponse, sessionId, clientId)

      // 如果是使用之前的响应，强制设置 isFinal 为 true
      if (result && !response) {
        result.isFinal = true
        this.logger.debug(
          `finalizeAudio: using last response with isFinal=true, clientId=${clientId}`
        )
      }

      return result
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

    // 调试日志：输出豆包原始数据结构
    if (this.shouldLogUtterances()) {
      const result = (payload.result ?? payload.data ?? payload) as Record<string, unknown>
      this.logger.debug(
        [
          'Doubao payload structure:',
          `message.sequence=${message.sequence}`,
          `result.is_final=${String(result?.is_final)}`,
          `result.isFinal=${String(result?.isFinal)}`,
          `result.final=${String(result?.final)}`,
          `result.utterances=${Array.isArray(result?.utterances) ? result.utterances.length : 'N/A'}`,
        ].join(' ')
      )
    }

    const utteranceSegment = this.extractUtteranceSegment(payload, message)
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
          `extracted isFinal=${String(utteranceSegment.isFinal)}`,
        ]
          .filter(Boolean)
          .join(' ')
      )
    }

    const extractedIsFinal = utteranceSegment?.isFinal ?? this.extractIsFinal(payload, message)

    // 额外日志：记录最终提取的 isFinal 值
    if (this.shouldLogUtterances()) {
      this.logger.debug(`Final isFinal value: ${String(extractedIsFinal)}`)
    }

    return {
      id: this.generateId(),
      sessionId,
      segmentKey: utteranceSegment?.segmentKey,
      speakerId,
      speakerName,
      content,
      isFinal: extractedIsFinal,
      confidence: utteranceSegment?.confidence ?? this.extractConfidence(payload),
    }
  }

  /**
   * 当 show_utterances 开启时，豆包可能在 utterances 内提供分句信息（有时也包含 speaker 信息）。
   * 这里优先提取“最后一条 utterance”作为当前段落内容，并给出 segmentKey 用于后端切段。
   */
  private extractUtteranceSegment(
    payload: Record<string, unknown>,
    message?: DoubaoDecodedMessage
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
      // utterances 只返回单条且缺少可稳定识别的 key 时，不切换为"按 utterance 返回"，避免覆盖历史内容
      return null
    }

    return {
      content,
      record: last,
      utterancesLength: utterances.length,
      segmentKey: utteranceKey.key,
      isFinal: this.extractIsFinalFromRecord(last, message, result),
      confidence: this.extractConfidenceFromRecord(last),
    }
  }

  private shouldLogUtterances(): boolean {
    return (
      process.env.TRANSCRIPT_DEBUG_LOG_UTTERANCES === '1' && process.env.NODE_ENV !== 'production'
    )
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

    // result 级别稳定字段兜底（避免使用 payload_sequence 这类“每帧变化”的字段导致过度切段/重复）
    const stableResultCandidates = [
      readScalar((result as any).utterance_id),
      readScalar((result as any).utteranceId),
      readScalar((result as any).utt_id),
      readScalar((result as any).uttId),
      readScalar((result as any).start_time),
      readScalar((result as any).startTime),
      readScalar((result as any).begin_time),
      readScalar((result as any).beginTime),
    ].filter(Boolean) as string[]

    if (stableResultCandidates.length > 0) {
      return { key: stableResultCandidates[0], source: 'result' }
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

  private readBooleanValue(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') {
      if (value === 1) return true
      if (value === 0) return false
      return undefined
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true' || normalized === '1') return true
      if (normalized === 'false' || normalized === '0') return false
    }
    return undefined
  }

  private readNumberValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return undefined
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }

  private pickBooleanValue(values: unknown[]): boolean | undefined {
    for (const value of values) {
      const parsed = this.readBooleanValue(value)
      if (parsed != null) return parsed
    }
    return undefined
  }

  private extractIsFinalFromRecord(
    record: Record<string, unknown>,
    message?: DoubaoDecodedMessage,
    resultLevel?: Record<string, unknown>
  ): boolean | undefined {
    const direct = this.pickBooleanValue([record.is_final, record.isFinal, record.final])
    if (direct != null) return direct

    // 如果 record 中没有 is_final，尝试从 result 级别获取
    // 这是因为豆包 ASR 的 utterances 模式下，is_final 可能只在 result 级别存在
    if (resultLevel) {
      const resultDirect = this.pickBooleanValue([
        resultLevel.is_final,
        resultLevel.isFinal,
        resultLevel.final,
      ])
      if (resultDirect != null) return resultDirect
    }

    const sequenceCandidates = [
      (record as any).sequence,
      (record as any).seq,
      (record as any).payload_sequence,
      (record as any).payloadSequence,
      message?.sequence,
    ]

    for (const candidate of sequenceCandidates) {
      const sequence = this.readNumberValue(candidate)
      if (sequence != null && sequence < 0) {
        return true
      }
    }

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

  private extractIsFinal(payload: Record<string, unknown>, message?: DoubaoDecodedMessage): boolean {
    const result = (payload.result ?? payload.data ?? payload) as Record<string, unknown>
    const direct = this.pickBooleanValue([
      result?.is_final,
      result?.isFinal,
      result?.final,
      payload?.is_final,
      payload?.isFinal,
      payload?.final,
    ])
    if (direct != null) return direct

    const sequenceCandidates = [
      (result as any).sequence,
      (result as any).seq,
      (result as any).payload_sequence,
      (result as any).payloadSequence,
      (payload as any).sequence,
      (payload as any).seq,
      (payload as any).payload_sequence,
      (payload as any).payloadSequence,
      message?.sequence,
    ]

    for (const candidate of sequenceCandidates) {
      const sequence = this.readNumberValue(candidate)
      if (sequence != null) {
        return sequence < 0
      }
    }

    return false
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
