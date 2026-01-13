/**
 * WebSocket 服务 (F1012)
 * 处理与后端的实时音频传输和转写结果接收
 */

import type { AsrConfig } from '../types'

export interface WebSocketConfig {
  url?: string
  protocols?: string | string[]
  maxReconnectAttempts?: number
}

export type MessageHandler = (data: any) => void
export type ConnectionHandler = () => void
export type ErrorHandler = (error: Event) => void

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

export interface ConnectionStatus {
  state: ConnectionState
  attempt: number
  maxAttempts: number
  nextRetryMs?: number
}

export type ConnectionStatusHandler = (status: ConnectionStatus) => void

export type StartTranscribePayload = {
  model?: string
  asrConfig?: AsrConfig
}

export type LegacyTranscriptData = {
  id?: string
  sessionId?: string
  content?: string
  speakerId?: string
  speakerName?: string
  speakerColor?: string
  confidence?: number
  isFinal?: boolean
  startTime?: string
  endTime?: string
  duration?: number
  isEdited?: boolean
  isMarked?: boolean
  audioOffset?: number
  timestamp?: number
}

export type TranscriptEventData = {
  sessionId: string
  revision: number
  event: {
    eventIndex: number
    speakerId: string
    speakerName: string
    content: string
    isFinal: boolean
    segmentKey?: string
    asrTimestampMs?: number
    audioDurationMs?: number
  }
}

export type TranscriptEventSegmentUpsertData = {
  id: string
  sessionId: string
  sequence: number
  content: string
  sourceStartEventIndex: number
  sourceEndEventIndex: number
  sourceRevision: number
  prevSegmentId?: string
  status: 'completed' | 'failed'
  error?: string
  model?: string
  generatedAt?: string
  createdAt?: string
}

export type TranscriptEventSegmentResetData = {
  sessionId: string
}

export type TranscriptMessage =
  | { type: 'transcript'; data: LegacyTranscriptData }
  | { type: 'status'; data: { status?: string; sessionId?: string; speakerId?: string; speakerName?: string } }
  | { type: 'error'; data: { error?: string } }
  | { type: 'transcript_event_upsert'; data: TranscriptEventData }
  | { type: 'transcript_event_segment_upsert'; data: TranscriptEventSegmentUpsertData }
  | { type: 'transcript_event_segment_reset'; data: TranscriptEventSegmentResetData }

export class WebSocketService {
  private ws: WebSocket | null = null
  private url: string
  private protocols?: string | string[]
  private maxReconnectAttempts: number

  private connectionStatusValue!: ConnectionStatus

  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualClose = false
  private connectPromise: Promise<void> | null = null

  private lastSessionId: string | null = null
  private lastTranscribeConfig: StartTranscribePayload | null = null
  private lastSpeaker: { speakerId?: string; speakerName?: string } | null = null
  private isTranscribing = false

  private audioSendCount = 0

  private messageListeners = new Set<MessageHandler>()
  private onOpenCallback: ConnectionHandler | null = null
  private onCloseCallback: ConnectionHandler | null = null
  private onErrorCallback: ErrorHandler | null = null
  private onConnectionStatusCallback: ConnectionStatusHandler | null = null

  constructor(config?: WebSocketConfig) {
    const getWsUrl = () => {
      const envUrl = (globalThis as any).__VITE_WS_URL__ || import.meta.env.VITE_WS_URL
      if (envUrl) return envUrl
      return `ws://${location.host}/transcript`
    }

    this.url = config?.url || getWsUrl()
    this.protocols = config?.protocols
    this.maxReconnectAttempts = Math.min(config?.maxReconnectAttempts || 5, 5)
    this.connectionStatusValue = {
      state: 'disconnected',
      attempt: 0,
      maxAttempts: this.maxReconnectAttempts,
    }
  }

  getUrl(): string {
    return this.url
  }

  setUrl(nextUrl: string): void {
    const trimmed = nextUrl.trim()
    if (!trimmed || trimmed === this.url) return

    this.url = trimmed

    // 若当前未在转写中，自动重连以让新地址立即生效；转写中修改将推迟到下次连接。
    if (this.isConnected && !this.isTranscribing) {
      this.disconnect()
      this.connect().catch(() => {
        // 交由上层处理连接失败提示
      })
    }
  }

  /**
   * 连接 WebSocket
   */
  connect(): Promise<void> {
    if (this.isConnected) return Promise.resolve()
    if (this.connectPromise) return this.connectPromise

    this.manualClose = false
    const isReconnecting = this.reconnectAttempts > 0
    this.emitConnectionStatus({
      state: isReconnecting ? 'reconnecting' : 'connecting',
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
    })

    this.connectPromise = new Promise((resolve, reject) => {
      let settled = false

      try {
        this.ws = new WebSocket(this.url, this.protocols)

        this.ws.onopen = () => {
          console.log('[WebSocket] 连接成功')
          this.reconnectAttempts = 0
          this.emitConnectionStatus({
            state: 'connected',
            attempt: 0,
            maxAttempts: this.maxReconnectAttempts,
          })
          this.restoreSubscriptions()
          this.onOpenCallback?.()
          settled = true
          resolve()
          this.connectPromise = null
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            for (const listener of this.messageListeners) {
              listener(data)
            }
          } catch (error) {
            console.error('[WebSocket] 消息解析失败:', error)
          }
        }

        this.ws.onclose = () => {
          console.log('[WebSocket] 连接关闭')
          this.ws = null
          this.onCloseCallback?.()
          if (!this.manualClose) {
            this.attemptReconnect()
          } else {
            this.emitConnectionStatus({
              state: 'disconnected',
              attempt: 0,
              maxAttempts: this.maxReconnectAttempts,
            })
          }
          this.connectPromise = null
        }

        this.ws.onerror = (error) => {
          console.error('[WebSocket] 错误:', error)
          this.onErrorCallback?.(error)
          if (!settled) {
            settled = true
            reject(error)
            this.connectPromise = null
          }
        }
      } catch (error) {
        reject(error)
        this.connectPromise = null
      }
    })

    return this.connectPromise
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.manualClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connectPromise = null
    this.reconnectAttempts = 0
    this.emitConnectionStatus({
      state: 'disconnected',
      attempt: 0,
      maxAttempts: this.maxReconnectAttempts,
    })
  }

  /**
   * 发送音频数据
   */
  sendAudioData(pcm16Data: Int16Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] 未连接，无法发送音频数据')
      return
    }

    if (import.meta.env.DEV) {
      this.audioSendCount += 1
      if (this.audioSendCount === 1 || this.audioSendCount % 20 === 0) {
        console.log('[WebSocket] 发送音频帧', {
          frames: this.audioSendCount,
          bytes: pcm16Data.byteLength,
        })
      }
    }

    // 直接发送二进制数据
    this.ws.send(pcm16Data.buffer)
  }

  /**
   * 发送 JSON 消息
   */
  sendMessage(data: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] 未连接，无法发送消息')
      return
    }

    this.ws.send(JSON.stringify(data))
  }

  /**
   * 设置会话
   */
  setSession(sessionId: string): void {
    this.lastSessionId = sessionId
    this.sendMessage({
      type: 'set_session',
      sessionId,
    })
  }

  /**
   * 设置当前连接的发言者信息（用于区分不同参会者）
   */
  setSpeaker(input: { speakerId?: string; speakerName?: string }): void {
    this.lastSpeaker = input
    this.sendMessage({
      type: 'set_speaker',
      ...input,
    })
  }

  /**
   * 开始转写
   */
  startTranscribe(config?: StartTranscribePayload): void {
    this.isTranscribing = true
    this.lastTranscribeConfig = config || null
    this.sendMessage({
      type: 'start_transcribe',
      ...config,
    })
  }

  /**
   * 停止转写
   */
  stopTranscribe(): void {
    this.isTranscribing = false
    this.sendMessage({
      type: 'stop_transcribe',
    })
  }

  /**
   * 结束当前发言段落
   */
  endTurn(sessionId?: string): void {
    const trimmedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
    const resolvedSessionId = trimmedSessionId || this.lastSessionId
    const payload: Record<string, unknown> = {
      type: 'end_turn',
    }

    if (resolvedSessionId) {
      payload.sessionId = resolvedSessionId
    }

    this.sendMessage(payload)
  }

  /**
   * 自动重连
   */
  private attemptReconnect(): void {
    if (this.manualClose) return

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] 达到最大重连次数')
      this.emitConnectionStatus({
        state: 'failed',
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
      })
      return
    }

    this.reconnectAttempts++
    console.log(`[WebSocket] 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    const delayMs = this.getReconnectDelayMs(this.reconnectAttempts)
    this.emitConnectionStatus({
      state: 'reconnecting',
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      nextRetryMs: delayMs,
    })

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[WebSocket] 重连失败:', error)
      })
    }, delayMs)
  }

  private getReconnectDelayMs(attempt: number): number {
    const delays = [1000, 2000, 5000, 10000]
    const index = Math.max(0, Math.min(attempt - 1, delays.length - 1))
    return delays[index]
  }

  private restoreSubscriptions(): void {
    if (!this.isConnected) return

    if (this.lastSessionId) {
      this.sendMessage({
        type: 'set_session',
        sessionId: this.lastSessionId,
      })
    }

    if (this.lastSpeaker) {
      this.sendMessage({
        type: 'set_speaker',
        ...this.lastSpeaker,
      })
    }

    if (this.isTranscribing) {
      this.sendMessage({
        type: 'start_transcribe',
        ...(this.lastTranscribeConfig || {}),
      })
    }
  }

  private emitConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatusValue = status
    this.onConnectionStatusCallback?.(status)
  }

  get connectionStatus(): ConnectionStatus {
    return this.connectionStatusValue
  }

  /**
   * 获取连接状态
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  /**
   * 事件监听器
   */
  onMessage(callback: MessageHandler): void {
    this.messageListeners.add(callback)
  }

  offMessage(callback: MessageHandler): void {
    this.messageListeners.delete(callback)
  }

  onOpen(callback: ConnectionHandler): void {
    this.onOpenCallback = callback
  }

  onClose(callback: ConnectionHandler): void {
    this.onCloseCallback = callback
  }

  onError(callback: ErrorHandler): void {
    this.onErrorCallback = callback
  }

  onConnectionStatus(callback: ConnectionStatusHandler): void {
    this.onConnectionStatusCallback = callback
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners(): void {
    this.messageListeners.clear()
    this.onOpenCallback = null
    this.onCloseCallback = null
    this.onErrorCallback = null
    this.onConnectionStatusCallback = null
  }
}

// 导出单例
export const websocket = new WebSocketService()
