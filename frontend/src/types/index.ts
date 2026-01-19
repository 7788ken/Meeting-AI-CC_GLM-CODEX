// 通用类型
export interface SelectOption {
  label: string
  value: string | number
  disabled?: boolean
}

// AI模型类型
export type AIModel = 'glm'

export const AI_MODELS: SelectOption[] = [{ label: 'GLM', value: 'glm' }]

// ASR 配置
export type AsrLanguage = 'zh' | 'en' | 'yue' | 'auto'

export interface AsrConfig {
  // 音频累积配置
  bufferDurationMs: number
  minAudioLengthMs: number

  // ASR 模型配置
  language: AsrLanguage
  hotwords?: string[]
  prompt?: string
}

// WebSocket消息类型
export enum WSMessageType {
  // 音频相关
  AUDIO_START = 'audio:start',
  AUDIO_DATA = 'audio:data',
  AUDIO_END = 'audio:end',
  // 转写相关
  TRANSCRIPT_START = 'transcript:start',
  TRANSCRIPT_DATA = 'transcript:data',
  TRANSCRIPT_END = 'transcript:end',
  // 会话相关
  SESSION_START = 'session:start',
  SESSION_END = 'session:end',
  // 错误
  ERROR = 'error',
}

export interface WSMessage {
  type: WSMessageType
  payload: unknown
}

export interface WSTranscriptData {
  speechId: string
  sessionId: string
  content: string
  isFinal: boolean
  confidence: number
}
