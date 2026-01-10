/**
 * 语音转写服务 (F1013)
 * 整合音频捕获和 WebSocket，处理实时转写
 */

import { audioCapture, type AudioDataCallback } from './audioCapture'
import { websocket, type ConnectionStatus, type TranscriptMessage } from './websocket'
import type { Speech } from './api'

export interface TranscriptionConfig {
  sessionId: string
  language?: string
  model?: string
  onTranscript?: (transcript: Speech) => void
  onError?: (error: Error) => void
  onStatusChange?: (status: 'idle' | 'connecting' | 'recording' | 'paused' | 'error') => void
  onConnectionStatusChange?: (status: ConnectionStatus) => void
}

export class TranscriptionService {
  private isRecording = false
  private isPaused = false
  private currentSessionId = ''
  private status: 'idle' | 'connecting' | 'recording' | 'paused' | 'error' = 'idle'

  private onTranscriptCallback?: (transcript: Speech) => void
  private onErrorCallback?: (error: Error) => void
  private onStatusChangeCallback?: (status: 'idle' | 'connecting' | 'recording' | 'paused' | 'error') => void
  private onConnectionStatusChangeCallback?: (status: ConnectionStatus) => void

  constructor() {
    this.setupWebSocketHandlers()
  }

  /**
   * 开始转写
   */
  async start(config: TranscriptionConfig): Promise<void> {
    if (this.isRecording) {
      throw new Error('转写已在进行中')
    }

    this.currentSessionId = config.sessionId
    this.onTranscriptCallback = config.onTranscript
    this.onErrorCallback = config.onError
    this.onStatusChangeCallback = config.onStatusChange
    this.onConnectionStatusChangeCallback = config.onConnectionStatusChange

    try {
      this.setStatus('connecting')

      // 连接 WebSocket
      if (!websocket.isConnected) {
        await websocket.connect()
      }

      // 设置会话
      websocket.setSession(config.sessionId)

      // 开始转写
      websocket.startTranscribe({
        language: config.language || 'zh-CN',
        model: config.model || 'doubao',
      })

      // 开始音频捕获
      await this.startAudioCapture()

      this.isRecording = true
      this.isPaused = false
      this.setStatus('recording')
    } catch (error) {
      this.setStatus('error')
      this.handleError(error instanceof Error ? error : new Error('转写启动失败'))
      throw error
    }
  }

  /**
   * 暂停转写
   */
  pause(): void {
    if (!this.isRecording || this.isPaused) return

    this.isPaused = true
    audioCapture.stopCapture()
    this.setStatus('paused')
  }

  /**
   * 恢复转写
   */
  async resume(): Promise<void> {
    if (!this.isRecording || !this.isPaused) return

    try {
      await this.startAudioCapture()
      this.isPaused = false
      this.setStatus('recording')
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('转写恢复失败'))
    }
  }

  /**
   * 停止转写
   */
  stop(): void {
    if (!this.isRecording) return

    this.isRecording = false
    this.isPaused = false
    audioCapture.stopCapture()
    websocket.stopTranscribe()
    this.setStatus('idle')
    this.onConnectionStatusChangeCallback = undefined
  }

  /**
   * 开始音频捕获
   */
  private async startAudioCapture(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onAudioData: AudioDataCallback = (audioData) => {
        // 转换为 PCM 16-bit
        const float32Array = audioData.data
        const pcm16 = new Int16Array(float32Array.length)
        for (let i = 0; i < float32Array.length; i++) {
          const sample = Math.max(-1, Math.min(1, float32Array[i]))
          pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }
        // 发送到 WebSocket
        websocket.sendAudioData(pcm16)
      }

      audioCapture
        .startCapture(onAudioData, (error) => this.handleError(error))
        .then(resolve)
        .catch(reject)
    })
  }

  /**
   * 设置 WebSocket 消息处理器
   */
  private setupWebSocketHandlers(): void {
    websocket.onMessage((data: TranscriptMessage) => {
      if (data.type === 'transcript' && data.data.isFinal) {
        this.handleTranscript(data.data)
      } else if (data.type === 'error') {
        this.handleError(new Error(data.data.error || '转写错误'))
      }
    })

    websocket.onConnectionStatus((status) => {
      this.onConnectionStatusChangeCallback?.(status)
      if (!this.isRecording) return

      if (status.state === 'reconnecting' || status.state === 'connecting') {
        if (!this.isPaused) this.setStatus('connecting')
        return
      }

      if (status.state === 'connected') {
        this.setStatus(this.isPaused ? 'paused' : 'recording')
        return
      }

      if (status.state === 'failed') {
        this.setStatus('error')
        this.handleError(new Error('WebSocket 重连失败'))
      }
    })

    websocket.onError((error) => {
      this.handleError(new Error('WebSocket 连接错误'))
    })
  }

  /**
   * 处理转写结果
   */
  private handleTranscript(data: TranscriptMessage['data']): void {
    if (!this.onTranscriptCallback) return

    const transcript: Speech = {
      id: Date.now().toString(),
      sessionId: this.currentSessionId,
      speakerId: data.speakerId || 'unknown',
      speakerName: data.speakerName || '未知发言者',
      content: data.content || '',
      confidence: data.confidence || 0,
      startTime: new Date(data.timestamp || Date.now()).toISOString(),
      endTime: new Date().toISOString(),
      duration: 0,
      isEdited: false,
      isMarked: false,
    }

    this.onTranscriptCallback(transcript)
  }

  /**
   * 错误处理
   */
  private handleError(error: Error): void {
    this.onErrorCallback?.(error)
  }

  /**
   * 状态更新
   */
  private setStatus(status: 'idle' | 'connecting' | 'recording' | 'paused' | 'error'): void {
    this.status = status
    this.onStatusChangeCallback?.(status)
  }

  /**
   * 获取当前状态
   */
  getStatus(): 'idle' | 'connecting' | 'recording' | 'paused' | 'error' {
    return this.status
  }

  /**
   * 是否正在录制
   */
  isActive(): boolean {
    return this.isRecording && !this.isPaused
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stop()
    websocket.disconnect()
    websocket.removeAllListeners()
  }
}

// 导出单例
export const transcription = new TranscriptionService()
