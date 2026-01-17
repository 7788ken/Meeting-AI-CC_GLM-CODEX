/**
 * 语音转写服务 (F1013)
 * 整合音频捕获和 WebSocket，处理实时转写
 */

import { AudioCaptureService, audioCapture, type AudioConfig, type AudioDataCallback } from './audioCapture'
import { websocket, type ConnectionStatus, type LegacyTranscriptData, type TranscriptMessage } from './websocket'
import type { Speech } from './api'
import type { AsrConfig } from '../types'

export interface TranscriptionConfig {
  sessionId: string
  language?: string
  asrConfig?: Partial<AsrConfig>
  audio?: AudioConfig
  onTranscript?: (transcript: Speech) => void
  onError?: (error: Error) => void
  onStatusChange?: (status: 'idle' | 'connecting' | 'recording' | 'paused' | 'error') => void
  onConnectionStatusChange?: (status: ConnectionStatus) => void
}

export const DEFAULT_ASR_CONFIG: AsrConfig = {
  bufferDurationMs: 3000,
  minAudioLengthMs: 500,
  language: 'zh',
}

export interface VadConfig {
  startThreshold: number
  stopThreshold: number
  gapMs: number
}

const DEFAULT_VAD_CONFIG: VadConfig = {
  startThreshold: Number(import.meta.env.VITE_TRANSCRIPT_VAD_START_TH ?? 0.015),
  stopThreshold: Number(import.meta.env.VITE_TRANSCRIPT_VAD_STOP_TH ?? 0.01),
  gapMs: Number(import.meta.env.VITE_TRANSCRIPT_VAD_GAP_MS ?? 900),
}

const vadConfig: VadConfig = { ...DEFAULT_VAD_CONFIG }

export const getVadConfig = (): VadConfig => ({ ...vadConfig })

export const applyVadConfig = (partial?: Partial<VadConfig>): VadConfig => {
  if (!partial) return getVadConfig()

  const normalize = (value: unknown, fallback: number, min?: number): number => {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && (min === undefined || parsed >= min)) {
      return parsed
    }
    return fallback
  }

  vadConfig.startThreshold = normalize(partial.startThreshold, vadConfig.startThreshold, 0)
  vadConfig.stopThreshold = normalize(partial.stopThreshold, vadConfig.stopThreshold, 0)
  vadConfig.gapMs = normalize(partial.gapMs, vadConfig.gapMs, 0)
  return getVadConfig()
}

const resolveAsrLanguage = (input?: string): AsrConfig['language'] => {
  if (!input) return DEFAULT_ASR_CONFIG.language
  const normalized = input.trim().toLowerCase()
  if (normalized === 'zh-cn' || normalized === 'zh_cn' || normalized === 'zh-hans') {
    return 'zh'
  }
  if (normalized === 'zh' || normalized === 'en' || normalized === 'yue' || normalized === 'auto') {
    return normalized
  }
  return DEFAULT_ASR_CONFIG.language
}

const resolveAsrConfig = (config: TranscriptionConfig): AsrConfig => {
  const asrConfig = config.asrConfig ?? {}
  return {
    bufferDurationMs:
      typeof asrConfig.bufferDurationMs === 'number'
        ? asrConfig.bufferDurationMs
        : DEFAULT_ASR_CONFIG.bufferDurationMs,
    minAudioLengthMs:
      typeof asrConfig.minAudioLengthMs === 'number'
        ? asrConfig.minAudioLengthMs
        : DEFAULT_ASR_CONFIG.minAudioLengthMs,
    language: resolveAsrLanguage(asrConfig.language ?? config.language),
    hotwords: asrConfig.hotwords,
    prompt: asrConfig.prompt,
  }
}

export class TranscriptionService {
  private isRecording = false
  private isPaused = false
  private isSendingAudio = false // 控制是否发送音频到 WebSocket
  private currentSessionId = ''
  private status: 'idle' | 'connecting' | 'recording' | 'paused' | 'error' = 'idle'
  private audioConfig?: AudioConfig

  private segmentCounter = 0
  private activeSegment: { id: string; startTime: string } | null = null

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
      this.segmentCounter = 0
      this.activeSegment = null
    }

    this.currentSessionId = config.sessionId
    this.onTranscriptCallback = config.onTranscript
    this.onErrorCallback = config.onError
    this.onStatusChangeCallback = config.onStatusChange
    this.onConnectionStatusChangeCallback = config.onConnectionStatusChange
    this.audioConfig = config.audio

    let transcribeStarted = false
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
        asrConfig: resolveAsrConfig(config),
      })
      transcribeStarted = true

      this.isPaused = false
      this.isSendingAudio = true

      // 开始音频捕获
      await this.startAudioCapture()

      this.isRecording = true
      this.setStatus('recording')
    } catch (error) {
      this.isRecording = false
      this.isPaused = false
      this.isSendingAudio = false
      this.audioConfig = undefined
      audioCapture.stopCapture()
      if (transcribeStarted) {
        websocket.stopTranscribe()
      }
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
    this.isSendingAudio = false
    audioCapture.stopCapture()
    this.setStatus('paused')
  }

  /**
   * 恢复转写
   */
  async resume(): Promise<void> {
    if (!this.isRecording || !this.isPaused) return

    try {
      this.isSendingAudio = true
      this.isPaused = false
      await this.startAudioCapture()
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
    this.isSendingAudio = false
    this.audioConfig = undefined
    audioCapture.stopCapture()
    websocket.stopTranscribe()
    this.setStatus('idle')
    this.onConnectionStatusChangeCallback = undefined
  }

  /**
   * 开始音频捕获
   * 使用 VAD：静音检测后停止发送音频，避免短暂停顿导致句子断裂
   */
  private async startAudioCapture(): Promise<void> {
    return new Promise((resolve, reject) => {
      const currentVad = getVadConfig()
      const vadStartThreshold = currentVad.startThreshold
      const vadStopThreshold = currentVad.stopThreshold
      const vadGapMs = currentVad.gapMs
      // VAD 状态机
      type VADState = 'idle' | 'speaking'
      let state: VADState = 'idle'
      let silentMs = 0

      const onAudioData: AudioDataCallback = (audioData) => {
        const sampleRate = Number(audioData.sampleRate) || 16000
        const frameMs = Math.max(0, Math.floor((audioData.data.length / sampleRate) * 1000))
        const energy = AudioCaptureService.getAudioEnergy(audioData.data)

        // 软暂停模式：如果未发送音频，仍然更新 VAD 状态以便恢复时无缝衔接
        if (!this.isSendingAudio) {
          // 仅在 idle 状态时检测是否要自动进入 speaking 状态，为恢复做准备
          if (state === 'idle' && energy >= vadStartThreshold) {
            state = 'speaking'
            silentMs = 0
          } else if (state === 'speaking' && energy < vadStopThreshold) {
            silentMs += frameMs
            if (silentMs >= vadGapMs) {
              state = 'idle'
              silentMs = 0
            }
          } else if (state === 'speaking' && energy >= vadStopThreshold) {
            silentMs = 0
          }
          return
        }

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
            // 仍然发送静音帧（让 ASR 知道有短暂停顿）
            const pcm16 = AudioCaptureService.floatToPCM16(audioData.data)
            websocket.sendAudioData(pcm16)
            if (silentMs >= vadGapMs) {
              state = 'idle'
              silentMs = 0
            }
            return
          }

          // 检测到声音，重置静音计数
          silentMs = 0
          const pcm16 = AudioCaptureService.floatToPCM16(audioData.data)
          websocket.sendAudioData(pcm16)
          return
        }

      }

      audioCapture
        .startCapture(onAudioData, (error) => this.handleError(error), this.audioConfig)
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

    websocket.onClose(() => {
      const shouldRollback = this.isRecording || this.isPaused || this.status === 'connecting'
      if (!shouldRollback || this.status === 'error') return
      this.handleError(new Error('WebSocket 连接已断开'))
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

    const isFinal = Boolean(data.isFinal)

    let active = this.activeSegment
    if (!active) {
      this.segmentCounter += 1

      active = {
        id: data.id || `${this.currentSessionId}:${this.segmentCounter}`,
        startTime: data.startTime || new Date().toISOString(),
      }
      this.activeSegment = active
    } else if (data.id && active.id !== data.id) {
      // 后端落库后会返回稳定的 speechId，优先使用，确保后续分析/查询可用
      active.id = data.id
    }

    const transcript: Speech = {
      id: active.id,
      sessionId: this.currentSessionId,
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
      this.activeSegment = null
    }
  }

  /**
   * 错误处理
   */
  private handleError(error: Error): void {
    if (this.isRecording || this.isPaused || this.status === 'connecting') {
      this.rollbackTranscriptionOnError()
    }
    this.onErrorCallback?.(error)
  }

  private rollbackTranscriptionOnError(): void {
    this.isRecording = false
    this.isPaused = false
    this.isSendingAudio = false
    this.audioConfig = undefined
    this.activeSegment = null
    audioCapture.stopCapture()
    websocket.stopTranscribe()
    this.setStatus('error')
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
    this.onTranscriptCallback = undefined
    this.onErrorCallback = undefined
    this.onStatusChangeCallback = undefined
    this.onConnectionStatusChangeCallback = undefined
  }
}

// 导出单例
export const transcription = new TranscriptionService()
