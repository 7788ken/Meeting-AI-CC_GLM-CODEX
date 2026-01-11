import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import {
  DoubaoBinaryCodec,
  DoubaoCompression,
  DoubaoDecodedMessage,
  DoubaoFlag,
  DoubaoMessageType,
  DoubaoSerialization,
} from './doubao.codec'

interface DoubaoClientOptions {
  endpoint: string
  appKey: string
  accessKey: string
  resourceId: string
  connectId: string
  userId: string
  modelName?: string
  enableItn?: boolean
  enablePunc?: boolean
  configGzip?: boolean
  audioGzip?: boolean
}

type ResponseWaiter = {
  resolve: (message: DoubaoDecodedMessage | null) => void
  reject: (error: Error) => void
  timeoutId: NodeJS.Timeout
}

class DoubaoWsClient {
  private ws?: WebSocket
  private connected = false
  private configured = false
  private sequence = 0
  private connectPromise?: Promise<void>
  private configPromise?: Promise<void>
  private readonly codec = new DoubaoBinaryCodec()
  private readonly responseQueue: DoubaoDecodedMessage[] = []
  private readonly responseWaiters: ResponseWaiter[] = []
  private readonly logger = new Logger(DoubaoWsClient.name)
  private openedAtMs: number | null = null
  private sentConfig = false
  private sentConfigSeq: number | null = null
  private sentAudioBytes = 0
  private closing = false
  private finalAudioSent = false

  constructor(private readonly options: DoubaoClientOptions) {}

  async sendAudio(audio: Buffer, isFinal: boolean): Promise<void> {
    await this.ensureReady()

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Doubao WebSocket not open')
    }

    if (audio.length > 0) {
      this.sentAudioBytes += audio.length
    }

    if (isFinal) {
      this.finalAudioSent = true
    }

    const flags = isFinal ? DoubaoFlag.LastNegSeq : DoubaoFlag.Seq
    const seq = ++this.sequence
    const sequence = isFinal ? -seq : seq

    const packet = this.codec.encode({
      messageType: DoubaoMessageType.Audio,
      flags,
      // 参考 Java demo：音频包同样走 gzip（对端若不兼容可用 TRANSCRIPT_AUDIO_GZIP=false 关闭）
      serialization: DoubaoSerialization.Json,
      compression: this.options.audioGzip === false ? DoubaoCompression.None : DoubaoCompression.Gzip,
      sequence,
      payload: audio,
    })

    this.ws.send(packet)
  }

  async nextResponse(timeoutMs = 5000): Promise<DoubaoDecodedMessage | null> {
    const queued = this.responseQueue.shift()
    if (queued) {
      return queued
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeWaiter(waiter)
        resolve(null)
      }, timeoutMs)

      const waiter: ResponseWaiter = {
        resolve: message => {
          clearTimeout(timeoutId)
          resolve(message)
        },
        reject: error => {
          clearTimeout(timeoutId)
          reject(error)
        },
        timeoutId,
      }

      this.responseWaiters.push(waiter)
    })
  }

  async close(): Promise<void> {
    if (!this.ws) {
      return
    }

    this.closing = true

    const ws = this.ws
    this.ws = undefined
    this.connected = false
    this.configured = false
    this.connectPromise = undefined
    this.configPromise = undefined

    if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
      return
    }

    await new Promise<void>(resolve => {
      ws.once('close', () => resolve())
      ws.close(1000, 'normal')
    })
  }

  private async ensureReady(): Promise<void> {
    await this.connect()

    if (this.configured) {
      return
    }

    if (!this.configPromise) {
      this.configPromise = this.sendConfig()
    }

    await this.configPromise
  }

  private async connect(): Promise<void> {
    if (this.connected) {
      return
    }

    if (!this.connectPromise) {
      this.connectPromise = new Promise<void>((resolve, reject) => {
        // 每次发起新的连接尝试时重置一次连接内状态（避免断线重连后 seq / 统计信息污染）
        this.sequence = 0
        this.sentConfig = false
        this.sentConfigSeq = null
        this.sentAudioBytes = 0
        this.openedAtMs = null
        this.closing = false
        this.finalAudioSent = false

        const headers = {
          'X-Api-App-Key': this.options.appKey,
          'X-Api-Access-Key': this.options.accessKey,
          'X-Api-Resource-Id': this.options.resourceId,
          'X-Api-Connect-Id': this.options.connectId,
        }

        const ws = new WebSocket(this.options.endpoint, { headers })
        this.ws = ws

        ws.on('open', () => {
          this.connected = true
          this.openedAtMs = Date.now()
          this.logger.log(`Doubao connected: ${this.options.connectId}`)
          resolve()
        })

        ws.on('message', data => this.handleMessage(data))
        ws.on('error', error => {
          if (this.closing) {
            return
          }
          const message = error instanceof Error ? error.message : String(error)
          this.logger.error(`Doubao WebSocket error: ${message}`)
          this.connected = false
          this.configured = false
          this.connectPromise = undefined
          this.configPromise = undefined
          this.ws = undefined
          this.rejectAll(new Error(message))
          if (!this.connected) {
            reject(error)
          }
        })

        ws.on('close', (code, reason) => {
          const reasonText = reason?.toString() || ''
          const expectedClose = this.closing || this.finalAudioSent
          this.connected = false
          this.configured = false
          this.connectPromise = undefined
          this.configPromise = undefined
          this.ws = undefined

          const openDurationMs =
            this.openedAtMs === null ? null : Math.max(0, Date.now() - this.openedAtMs)

          const details = [
            `code=${code}`,
            reasonText ? `reason=${reasonText}` : null,
            openDurationMs === null ? null : `openMs=${openDurationMs}`,
            this.sentConfig ? 'config=sent' : 'config=not_sent',
            this.sentConfigSeq == null ? null : `configSeq=${this.sentConfigSeq}`,
            `configGzip=${this.options.configGzip === false ? 'off' : 'on'}`,
            `audioGzip=${this.options.audioGzip === false ? 'off' : 'on'}`,
            this.sentAudioBytes > 0 ? `audioBytes=${this.sentAudioBytes}` : 'audioBytes=0',
            `resourceId=${this.options.resourceId}`,
            `modelName=${this.options.modelName ?? 'bigmodel'}`,
          ]
            .filter(Boolean)
            .join(' ')

          const message = `Doubao WebSocket closed: ${details}`
          if (expectedClose) {
            this.logger.log(message)
            this.resolveAll(null)
            return
          }

          this.logger.warn(message)
          this.rejectAll(new Error(message))
        })
      })
    }

    await this.connectPromise
  }

  private async sendConfig(): Promise<void> {
    if (!this.ws) {
      throw new Error('Doubao WebSocket not connected')
    }

    const payload = {
      user: { uid: this.options.userId },
      audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
      request: {
        model_name: this.options.modelName ?? 'bigmodel',
        enable_itn: this.options.enableItn ?? true,
        enable_punc: this.options.enablePunc ?? true,
        enable_ddc: true,
        show_utterances: true,
        enable_nonstream: false,
      },
    }

    const seq = ++this.sequence

    const packet = this.codec.encode({
      messageType: DoubaoMessageType.Config,
      // Java demo/官方示例使用带序列号的 Config（不带序列号时服务端可能直接断连 1006）
      flags: DoubaoFlag.Seq,
      serialization: DoubaoSerialization.Json,
      // 豆包/火山流式 ASR 的 Config 通常使用 gzip 压缩 JSON（服务端也可能在不匹配时直接异常断连 1006）
      compression: this.options.configGzip === false ? DoubaoCompression.None : DoubaoCompression.Gzip,
      sequence: seq,
      payload,
    })

    this.ws.send(packet)
    this.sentConfig = true
    this.sentConfigSeq = seq
    this.configured = true
  }

  private handleMessage(data: WebSocket.RawData) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)

    let decoded: DoubaoDecodedMessage
    try {
      decoded = this.codec.decode(buffer)
    } catch (error) {
      this.logger.error(
        `Doubao decode failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return
    }

    if (decoded.messageType === DoubaoMessageType.Error) {
      const errorMessage = this.formatError(decoded.payload)
      this.logger.error(errorMessage)
      this.rejectAll(new Error(errorMessage))
      return
    }

    if (decoded.messageType !== DoubaoMessageType.Response) {
      this.logger.debug(`Doubao message ignored: ${decoded.messageType}`)
      return
    }

    this.enqueueResponse(decoded)
  }

  private formatError(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
      return 'Doubao error response'
    }

    const data = payload as Record<string, unknown>
    const code = data.code ?? data.status ?? 'unknown'
    const message = data.message ?? data.msg ?? 'unknown'
    return `Doubao error: ${code} ${message}`
  }

  private enqueueResponse(message: DoubaoDecodedMessage) {
    const waiter = this.responseWaiters.shift()
    if (waiter) {
      clearTimeout(waiter.timeoutId)
      waiter.resolve(message)
      return
    }
    this.responseQueue.push(message)
  }

  private removeWaiter(waiter: ResponseWaiter) {
    const index = this.responseWaiters.indexOf(waiter)
    if (index >= 0) {
      this.responseWaiters.splice(index, 1)
    }
  }

  private rejectAll(error: Error) {
    const waiters = this.responseWaiters.splice(0, this.responseWaiters.length)
    for (const waiter of waiters) {
      clearTimeout(waiter.timeoutId)
      waiter.reject(error)
    }
    this.responseQueue.length = 0
  }

  private resolveAll(message: DoubaoDecodedMessage | null) {
    const waiters = this.responseWaiters.splice(0, this.responseWaiters.length)
    for (const waiter of waiters) {
      clearTimeout(waiter.timeoutId)
      waiter.resolve(message)
    }
    this.responseQueue.length = 0
  }
}

@Injectable()
export class DoubaoClientManager {
  private readonly clients = new Map<string, DoubaoWsClient>()
  private readonly logger = new Logger(DoubaoClientManager.name)

  constructor(private readonly configService: ConfigService) {}

  getOrCreate(clientId: string, userId: string): DoubaoWsClient {
    const existing = this.clients.get(clientId)
    if (existing) {
      return existing
    }

    const endpoint = this.readRequired('TRANSCRIPT_ENDPOINT')
    const appKey = this.readRequired('TRANSCRIPT_APP_KEY')
    const accessKey = this.readRequired('TRANSCRIPT_ACCESS_KEY')
    const resourceId =
      this.configService.get<string>('TRANSCRIPT_RESOURCE_ID') ?? 'volc.bigasr.sauc.duration'
    const modelName = this.configService.get<string>('TRANSCRIPT_MODEL_NAME') ?? 'bigmodel'
    const enableItnRaw = this.configService.get<string>('TRANSCRIPT_ENABLE_ITN')
    const enablePuncRaw = this.configService.get<string>('TRANSCRIPT_ENABLE_PUNC')
    const configGzipRaw = this.configService.get<string>('TRANSCRIPT_CONFIG_GZIP')
    const audioGzipRaw = this.configService.get<string>('TRANSCRIPT_AUDIO_GZIP')
    const enableItn = enableItnRaw == null ? undefined : enableItnRaw === '1' || enableItnRaw === 'true'
    const enablePunc =
      enablePuncRaw == null ? undefined : enablePuncRaw === '1' || enablePuncRaw === 'true'
    const configGzip =
      configGzipRaw == null ? undefined : configGzipRaw === '1' || configGzipRaw === 'true'
    const audioGzip =
      audioGzipRaw == null ? undefined : audioGzipRaw === '1' || audioGzipRaw === 'true'

    const client = new DoubaoWsClient({
      endpoint,
      appKey,
      accessKey,
      resourceId,
      connectId: randomUUID(),
      userId,
      modelName,
      enableItn,
      enablePunc,
      configGzip,
      audioGzip,
    })

    this.clients.set(clientId, client)
    this.logger.log(`Doubao client created: ${clientId}`)
    return client
  }

  get(clientId: string): DoubaoWsClient | undefined {
    return this.clients.get(clientId)
  }

  async close(clientId: string): Promise<void> {
    const client = this.clients.get(clientId)
    if (!client) {
      return
    }
    this.clients.delete(clientId)
    await client.close()
    this.logger.log(`Doubao client closed: ${clientId}`)
  }

  private readRequired(key: string): string {
    const value = this.configService.get<string>(key)
    if (!value) {
      throw new Error(`Missing config: ${key}`)
    }
    return value
  }
}
