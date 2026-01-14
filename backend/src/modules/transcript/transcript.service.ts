import { Injectable, Logger } from '@nestjs/common'
import { TranscriptResultDto } from './dto/transcript.dto'
import { SmartAudioBufferService } from './smart-audio-buffer.service'
import { GlmAsrClient } from './glm-asr.client'
import type { AsrConfigDto } from './dto/transcript.dto'

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
    private readonly glmAsrClient: GlmAsrClient,
    private readonly smartAudioBufferService: SmartAudioBufferService
  ) {}

  addClient(clientId: string, socket: any) {
    this.clients.set(clientId, socket)
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId)
    this.smartAudioBufferService.clear(clientId)
  }

  async processAudioWithBuffer(
    clientId: string,
    audioData: string,
    sessionId: string,
    isFinal = false,
    options?: TranscriptProcessOptions
  ): Promise<TranscriptResultDto | null> {
    try {
      const audioBuffer = this.decodeAudioData(audioData)

      if (!audioBuffer.length && !isFinal) {
        this.logger.warn(`Empty audio data, clientId=${clientId}`)
        return null
      }

      const appended = this.smartAudioBufferService.appendAudio(clientId, audioBuffer)
      let bufferToSend = appended.buffer
      let durationMs = appended.durationMs
      let config = appended.config

      if (isFinal && !bufferToSend) {
        const flushed = this.smartAudioBufferService.flush(clientId, { force: true })
        bufferToSend = flushed.buffer
        durationMs = flushed.durationMs
        config = flushed.config
      }

      if (!bufferToSend) {
        return null
      }

      const result = await this.transcribeBuffer(
        sessionId,
        clientId,
        bufferToSend,
        config,
        durationMs
      )

      if (result && isFinal) {
        result.isFinal = true
      }

      return result
    } catch (error) {
      this.logger.error(
        `GLM ASR failed, clientId=${clientId}`,
        error instanceof Error ? error.stack : String(error)
      )
      if (options?.propagateError) {
        throw error instanceof Error ? error : new Error(String(error))
      }
      return null
    }
  }

  async processAudio(
    clientId: string,
    audioData: string,
    sessionId: string,
    isFinal = false,
    options?: TranscriptProcessOptions
  ): Promise<TranscriptResultDto | null> {
    return this.processAudioWithBuffer(clientId, audioData, sessionId, isFinal, options)
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

      return await this.transcribeBuffer(
        sessionId,
        clientId,
        appended.buffer,
        appended.config,
        appended.durationMs
      )
    } catch (error) {
      this.logger.error(
        `GLM ASR binary failed, clientId=${clientId}`,
        error instanceof Error ? error.stack : String(error)
      )
      if (options?.propagateError) {
        throw error instanceof Error ? error : new Error(String(error))
      }
      return null
    }
  }

  async finalizeAudio(
    clientId: string,
    sessionId: string,
    options?: TranscriptProcessOptions
  ): Promise<TranscriptResultDto | null> {
    try {
      const flushed = this.smartAudioBufferService.flush(clientId, { force: true })
      if (!flushed.buffer) {
        return null
      }

      const result = await this.transcribeBuffer(
        sessionId,
        clientId,
        flushed.buffer,
        flushed.config,
        flushed.durationMs
      )

      if (result) {
        result.isFinal = true
      }

      return result
    } catch (error) {
      this.logger.error(
        `GLM endAudio failed, clientId=${clientId}`,
        error instanceof Error ? error.stack : String(error)
      )
      if (options?.propagateError) {
        throw error instanceof Error ? error : new Error(String(error))
      }
      return null
    }
  }

  async endAudio(clientId: string): Promise<void> {
    this.smartAudioBufferService.flush(clientId, { force: true })
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

  private async transcribeBuffer(
    sessionId: string,
    clientId: string,
    audioBuffer: Buffer,
    config: AsrConfigDto | undefined,
    audioDurationMs?: number
  ): Promise<TranscriptResultDto | null> {
    let lastText = ''
    let lastIsFinal = false
    let segmentKey: string | undefined

    for await (const chunk of this.glmAsrClient.transcribeStream(audioBuffer, {
      language: config?.language,
      hotwords: config?.hotwords,
      prompt: config?.prompt,
    })) {
      if (!segmentKey && chunk.requestId) {
        segmentKey = `glm:${chunk.requestId}`
      }

      if (chunk.text) {
        lastText = chunk.text
      }

      if (chunk.isFinal) {
        lastIsFinal = true
      }
    }

    if (!lastText) {
      return null
    }

    return {
      id: this.generateId(),
      sessionId,
      segmentKey,
      speakerId: `client_${clientId}`,
      speakerName: '发言者',
      content: lastText,
      isFinal: lastIsFinal,
      confidence: 0,
      audioDurationMs,
    }
  }

  private generateId(): string {
    return `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}
