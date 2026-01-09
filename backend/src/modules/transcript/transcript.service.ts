import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TranscriptResultDto } from './dto/transcript.dto'
import { DoubaoClientManager } from './doubao.client'
import { DoubaoDecodedMessage } from './doubao.codec'

// Socket.IO 的 Socket 类型（使用 any 简化类型）
type Socket = any

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
    isFinal = false
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
      return null
    } finally {
      if (isFinal) {
        await this.doubaoClientManager.close(clientId)
      }
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

    const base64 = audioData.includes(',') ? audioData.split(',').pop() ?? '' : audioData
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
    const content = this.extractText(payload)
    if (!content) {
      return null
    }

    const { speakerId, speakerName } = this.extractSpeaker(payload, clientId)

    return {
      id: this.generateId(),
      sessionId,
      speakerId,
      speakerName,
      content,
      isFinal: this.extractIsFinal(payload),
      confidence: this.extractConfidence(payload),
    }
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
        .map((item) => (typeof item?.text === 'string' ? item.text : ''))
        .filter((value) => value.length > 0)
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
