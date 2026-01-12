/**
 * 语音转写服务 (F1013)
 * 整合音频捕获和 WebSocket，处理实时转写
 */

import { AudioCaptureService, audioCapture, type AudioDataCallback } from './audioCapture'
import { websocket, type ConnectionStatus, type LegacyTranscriptData, type TranscriptMessage } from './websocket'
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
   * 使用两阶段 VAD：静音检测 + 确认延迟，避免短暂停顿导致句子断裂
   */
  private async startAudioCapture(): Promise<void> {
    return new Promise((resolve, reject) => {
      const vadStartThreshold = Number(import.meta.env.VITE_TRANSCRIPT_VAD_START_TH ?? 0.015)
      const vadStopThreshold = Number(import.meta.env.VITE_TRANSCRIPT_VAD_STOP_TH ?? 0.01)
      const vadGapMs = Number(import.meta.env.VITE_TRANSCRIPT_VAD_GAP_MS ?? 900)
      // 确认延迟：检测到静音后再等待一段时间，确认是否真的结束了
      const vadConfirmMs = Number(import.meta.env.VITE_TRANSCRIPT_VAD_CONFIRM_MS ?? 500)

      // VAD 状态机
      type VADState = 'idle' | 'speaking' | 'confirming'
      let state: VADState = 'idle'
      let silentMs = 0
      let confirmTimer: ReturnType<typeof setTimeout> | null = null

      /**
       * 进入确认状态：启动定时器，如果在确认期间没有新声音则真正结束
       */
      const startConfirming = () => {
        state = 'confirming'
        if (confirmTimer) {
          clearTimeout(confirmTimer)
        }
        confirmTimer = setTimeout(() => {
          // 确认期结束，真的没有新声音，发送 end_turn
          websocket.endTurn()
          state = 'idle'
          silentMs = 0
          confirmTimer = null
        }, vadConfirmMs)
      }

      /**
       * 取消确认：在确认期间检测到新声音，回到 speaking 状态
       */
      const cancelConfirming = () => {
        if (confirmTimer) {
          clearTimeout(confirmTimer)
          confirmTimer = null
        }
        state = 'speaking'
        silentMs = 0
      }

      const onAudioData: AudioDataCallback = (audioData) => {
        const sampleRate = Number(audioData.sampleRate) || 16000
        const frameMs = Math.max(0, Math.floor((audioData.data.length / sampleRate) * 1000))
        const energy = AudioCaptureService.getAudioEnergy(audioData.data)

        if (state === 'idle') {
          // 空闲状态：仅在检测到足够大的声音时开始
          if (energy < vadStartThreshold) {
            return
          }
          state = 'speaking'
          silentMs = 0
          // 转换并发送第一帧
          const pcm16 = AudioCaptureService.floatToPCM16(audioData.data)
          websocket.sendAudioData(pcm16)
          return
        }

        if (state === 'speaking') {
          // 说话状态：检测静音累积
          if (energy < vadStopThreshold) {
            silentMs += frameMs
            // 静音持续足够久，进入确认期（此时继续发送音频，但准备结束）
            if (silentMs >= vadGapMs) {
              startConfirming()
            }
            // 仍然发送静音帧（让 ASR 知道有短暂停顿）
            const pcm16 = AudioCaptureService.floatToPCM16(audioData.data)
            websocket.sendAudioData(pcm16)
            return
          }

          // 检测到声音，重置静音计数
          silentMs = 0
          const pcm16 = AudioCaptureService.floatToPCM16(audioData.data)
          websocket.sendAudioData(pcm16)
          return
        }

        if (state === 'confirming') {
          // 确认状态：检测是否有新声音
          if (energy >= vadStopThreshold) {
            // 检测到新声音，取消结束，继续说话
            cancelConfirming()
            const pcm16 = AudioCaptureService.floatToPCM16(audioData.data)
            websocket.sendAudioData(pcm16)
            return
          }

          // 仍在静音中，继续发送音频帧（ASR 可能会返回最终结果）
          const pcm16 = AudioCaptureService.floatToPCM16(audioData.data)
          websocket.sendAudioData(pcm16)
          return
        }
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
  private handleTranscript(data: LegacyTranscriptData): void {
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
    websocket.removeAllListeners()
    websocket.disconnect()
    this.segmentCounterBySpeaker.clear()
    this.activeSegmentBySpeaker.clear()
    this.onTranscriptCallback = undefined
    this.onErrorCallback = undefined
    this.onStatusChangeCallback = undefined
    this.onConnectionStatusChangeCallback = undefined
  }
}

// 导出单例
export const transcription = new TranscriptionService()
