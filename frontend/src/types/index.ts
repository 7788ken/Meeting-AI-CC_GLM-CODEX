// 通用类型
export interface SelectOption {
  label: string
  value: string | number
  disabled?: boolean
}

// 发言者类型
export interface Speaker {
  id: string
  name: string
  color: string
}

// AI模型类型
export type AIModel = 'qianwen' | 'doubao' | 'glm' | 'minimax' | 'kimi' | 'dc'

export const AI_MODELS: SelectOption[] = [
  { label: '千问', value: 'qianwen' },
  { label: '豆包', value: 'doubao' },
  { label: 'GLM', value: 'glm' },
  { label: 'MINIMAX', value: 'minimax' },
  { label: 'KIMI', value: 'kimi' },
  { label: 'DC', value: 'dc' },
]

// 分析类型
export type AnalysisType = 'core' | 'brief' | 'deep'

export const ANALYSIS_TYPES: SelectOption[] = [
  { label: '核心要点', value: 'core' },
  { label: '简要回答', value: 'brief' },
  { label: '深度分析', value: 'deep' },
]

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
  speakerId: string
  speakerName: string
  content: string
  isFinal: boolean
  confidence: number
}
