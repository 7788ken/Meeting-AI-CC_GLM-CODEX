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

  constructor(private readonly options: DoubaoClientOptions) {}

  async sendAudio(audio: Buffer, isFinal: boolean): Promise<void> {
    await this.ensureReady()

    const flags = isFinal ? DoubaoFlag.LastNegSeq : DoubaoFlag.Seq
    const seq = ++this.sequence
    const sequence = isFinal ? -seq : seq

    const packet = this.codec.encode({
      messageType: DoubaoMessageType.Audio,
      flags,
      serialization: DoubaoSerialization.None,
      compression: DoubaoCompression.None,
      sequence,
      payload: audio,
    })

    this.ws?.send(packet)
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
        resolve: (message) => {
          clearTimeout(timeoutId)
          resolve(message)
        },
        reject: (error) => {
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

    const ws = this.ws
    this.ws = undefined
    this.connected = false
    this.configured = false
    this.connectPromise = undefined
    this.configPromise = undefined

    if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
      return
    }

    await new Promise<void>((resolve) => {
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
          this.logger.log(`Doubao connected: ${this.options.connectId}`)
          resolve()
        })

        ws.on('message', (data) => this.handleMessage(data))
        ws.on('error', (error) => {
          const message = error instanceof Error ? error.message : String(error)
          this.logger.error(`Doubao WebSocket error: ${message}`)
          this.rejectAll(new Error(message))
          if (!this.connected) {
            reject(error)
          }
        })

        ws.on('close', (code, reason) => {
          this.connected = false
          this.configured = false
          this.logger.warn(`Doubao closed: ${code} ${reason.toString()}`)
          this.rejectAll(new Error('Doubao WebSocket closed'))
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
      audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
      request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true },
    }

    const packet = this.codec.encode({
      messageType: DoubaoMessageType.Config,
      flags: DoubaoFlag.NoSeq,
      serialization: DoubaoSerialization.Json,
      compression: DoubaoCompression.None,
      payload,
    })

    this.ws.send(packet)
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
      this.configService.get<string>('TRANSCRIPT_RESOURCE_ID') ??
      'volc.seedasr.sauc.concurrent'

    const client = new DoubaoWsClient({
      endpoint,
      appKey,
      accessKey,
      resourceId,
      connectId: randomUUID(),
      userId,
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
