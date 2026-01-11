/**
 * 语音转写服务 (F1013)
 * 整合音频捕获和 WebSocket，处理实时转写
 */

import { AudioCaptureService, audioCapture, type AudioDataCallback } from './audioCapture'
import { websocket, type ConnectionStatus, type TranscriptMessage } from './websocket'
import type { Speech } from './api'

export interface TranscriptionConfig {
  sessionId: string
  language?: string
  model?: string
  speakerId?: string
  speakerName?: string
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

  private segmentCounterBySpeaker = new Map<string, number>()
  private activeSegmentBySpeaker = new Map<string, { id: string; startTime: string }>()

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

    if (this.currentSessionId && this.currentSessionId !== config.sessionId) {
      this.segmentCounterBySpeaker.clear()
      this.activeSegmentBySpeaker.clear()
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

      // 设置当前发言者（可选：用于多人会议区分）
      if (config.speakerId || config.speakerName) {
        websocket.setSpeaker({
          speakerId: config.speakerId,
          speakerName: config.speakerName,
        })
      }

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
        const pcm16 = AudioCaptureService.floatToPCM16(audioData.data)
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
      if (data.type === 'transcript' && data.data.content) {
        this.handleTranscript(data.data)
      } else if (data.type === 'status') {
        if (import.meta.env.DEV) {
          console.log('[Transcription] 状态消息', data.data)
        }
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

    const speakerId = data.speakerId || 'unknown'
    const isFinal = Boolean(data.isFinal)

    let active = this.activeSegmentBySpeaker.get(speakerId)
    if (!active) {
      const nextIndex = (this.segmentCounterBySpeaker.get(speakerId) ?? 0) + 1
      this.segmentCounterBySpeaker.set(speakerId, nextIndex)

      active = {
        id: data.id || `${this.currentSessionId}:${speakerId}:${nextIndex}`,
        startTime: data.startTime || new Date().toISOString(),
      }
      this.activeSegmentBySpeaker.set(speakerId, active)
    } else if (data.id && active.id !== data.id) {
      // 后端落库后会返回稳定的 speechId，优先使用，确保后续分析/查询可用
      active.id = data.id
    }

    const transcript: Speech = {
      id: active.id,
      sessionId: this.currentSessionId,
      speakerId: data.speakerId || 'unknown',
      speakerName: data.speakerName || '未知发言者',
      speakerColor: data.speakerColor,
      content: data.content || '',
      confidence: data.confidence || 0,
      startTime: data.startTime || active.startTime,
      endTime: data.endTime || new Date().toISOString(),
      duration: data.duration || 0,
      isEdited: Boolean(data.isEdited),
      isMarked: Boolean(data.isMarked),
      audioOffset: data.audioOffset,
    }

    this.onTranscriptCallback(transcript)

    if (isFinal) {
      this.activeSegmentBySpeaker.delete(speakerId)
    }
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
    this.segmentCounterBySpeaker.clear()
    this.activeSegmentBySpeaker.clear()
  }
}

// 导出单例
export const transcription = new TranscriptionService()
