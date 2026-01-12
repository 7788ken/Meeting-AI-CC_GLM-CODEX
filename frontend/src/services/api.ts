import { get, post, put, del, type ApiResponse } from './http'

// ==================== 类型定义 ====================

// 会话类型
export interface Session {
  id: string
  title?: string
  description?: string
  startedAt: string
  endedAt: string | null
  duration: number | null
  isActive: boolean
  isArchived: boolean
}

// 发言记录类型
export interface Speech {
  id: string
  sessionId: string
  speakerId: string
  speakerName: string
  speakerColor?: string
  content: string
  confidence: number
  startTime: string
  endTime: string
  duration: number
  isEdited: boolean
  isMarked: boolean
  audioOffset?: number
}

// AI 分析类型
export interface AIAnalysis {
  id: string
  sessionId: string
  analysisType: string
  modelUsed: string
  result: string
  status: string
  processingTime?: number
  isCached?: boolean
  generatedAt?: string
  createdAt: string
}

// 发言者类型
export interface Speaker {
  id: string
  sessionId: string
  name: string
  avatarUrl?: string
  color: string
}

// ==================== 原文事件流（Phase 0/1） ====================

export interface TranscriptEvent {
  eventIndex: number
  speakerId: string
  speakerName: string
  content: string
  isFinal: boolean
  segmentKey?: string
  asrTimestampMs?: number
}

export interface TranscriptStreamSnapshot {
  sessionId: string
  revision: number
  nextEventIndex: number
  events: TranscriptEvent[]
}

// ==================== 轮次分段（Phase 2） ====================

export interface TurnSegmentRange {
  speakerId: string
  speakerName: string
  startEventIndex: number
  endEventIndex: number
}

export interface TurnSegmentsSnapshot {
  sessionId: string
  revision: number
  targetRevision: number
  status: 'processing' | 'completed' | 'failed'
  segments: TurnSegmentRange[]
  error?: string
  model?: string
  generatedAt?: string
}

// ==================== 会话调试错误 ====================

export interface DebugError {
  id: string
  sessionId: string
  level: 'info' | 'warn' | 'error' | 'fatal'
  message: string
  source?: string
  category?: string
  errorCode?: string
  stack?: string
  context?: unknown
  occurredAt?: string
  createdAt: string
}

// ==================== 会话 API ====================

export const sessionApi = {
  // 创建会话
  create: (data?: { title?: string; description?: string }) =>
    post<ApiResponse<Session>>('/sessions', { settings: data }),

  // 结束会话
  end: (sessionId: string) =>
    post<ApiResponse<Session>>(`/sessions/${sessionId}/end`),

  // 存档会话
  archive: (sessionId: string) =>
    post<ApiResponse<Session>>(`/sessions/${sessionId}/archive`),

  // 取消存档
  unarchive: (sessionId: string) =>
    post<ApiResponse<Session>>(`/sessions/${sessionId}/unarchive`),

  // 获取会话详情
  get: (sessionId: string) =>
    get<ApiResponse<Session>>(`/sessions/${sessionId}`),

  // 获取所有会话
  list: () =>
    get<ApiResponse<Session[]>>('/sessions'),

  // 删除会话
  remove: (sessionId: string) =>
    del<ApiResponse<{ deleted: boolean }>>(`/sessions/${sessionId}`),

  // 更新会话状态
  updateStatus: (sessionId: string, status: string) =>
    put<ApiResponse<Session>>(`/sessions/${sessionId}/status`, { status }),

  // 添加发言者
  addSpeaker: (sessionId: string, data: { name: string; avatarUrl?: string; color?: string }) =>
    post<ApiResponse<Speaker>>(`/sessions/${sessionId}/speakers`, data),

  // 获取发言者列表
  getSpeakers: (sessionId: string) =>
    get<ApiResponse<Speaker[]>>(`/sessions/${sessionId}/speakers`),
}

// ==================== 发言记录 API ====================

export const speechApi = {
  // 创建发言记录
  create: (data: Partial<Speech>) =>
    post<ApiResponse<Speech>>('/speeches', data),

  // 批量创建发言记录
  batchCreate: (data: Partial<Speech>[]) =>
    post<ApiResponse<Speech[]>>('/speeches/batch', data),

  // 获取发言详情
  get: (speechId: string) =>
    get<ApiResponse<Speech>>(`/speeches/${speechId}`),

  // 获取会话的所有发言
  list: (sessionId: string) =>
    get<ApiResponse<Speech[]>>(`/speeches/session/${sessionId}`),

  // 获取发言者的所有发言
  listBySpeaker: (sessionId: string, speakerId: string) =>
    get<ApiResponse<Speech[]>>(`/speeches/session/${sessionId}/speaker/${speakerId}`),

  // 搜索发言记录
  search: (sessionId: string, keyword: string) =>
    get<ApiResponse<Speech[]>>(`/speeches/session/${sessionId}/search?keyword=${encodeURIComponent(keyword)}`),

  // 更新发言
  update: (speechId: string, data: Partial<Speech>) =>
    put<ApiResponse<Speech>>(`/speeches/${speechId}`, data),

  // 标记/取消标记发言
  toggleMark: (speechId: string, marked: boolean, reason?: string) =>
    put<ApiResponse<Speech>>(`/speeches/${speechId}/mark`, { marked, reason }),

  // 删除会话的所有发言
  deleteBySession: (sessionId: string) =>
    del(`/speeches/session/${sessionId}`),
}

// ==================== AI 分析 API ====================

export interface AnalysisRequest {
  sessionId: string
  speechIds: string[]
  analysisType?: 'summary' | 'action-items' | 'sentiment' | 'keywords' | 'topics' | 'full-report'
  model?: string
}

export const analysisApi = {
  // 生成 AI 分析
  generate: (data: AnalysisRequest) =>
    post<ApiResponse<AIAnalysis>>('/analysis/generate', data),

  // 获取或生成 AI 分析（使用缓存）
  getOrCreate: (data: AnalysisRequest) =>
    post<ApiResponse<AIAnalysis>>('/analysis/get-or-create', data),

  // 获取分析详情
  get: (analysisId: string) =>
    get<ApiResponse<AIAnalysis>>(`/analysis/${analysisId}`),

  // 获取会话的所有分析
  list: (sessionId: string) =>
    get<ApiResponse<AIAnalysis[]>>(`/analysis/session/${sessionId}`),

  // 获取会话的特定类型分析
  listByType: (sessionId: string, analysisType: string) =>
    get<ApiResponse<AIAnalysis[]>>(`/analysis/session/${sessionId}/type/${analysisType}`),

  // 删除会话的所有分析
  deleteBySession: (sessionId: string) =>
    del(`/analysis/session/${sessionId}`),
}

export const transcriptStreamApi = {
  // 获取会话原文事件流快照（用于刷新恢复）
  getSnapshot: (sessionId: string, limit?: number) => {
    const query = limit == null ? '' : `?limit=${encodeURIComponent(String(limit))}`
    return get<ApiResponse<TranscriptStreamSnapshot>>(`/transcript-stream/session/${sessionId}${query}`)
  },
}

export const turnSegmentationApi = {
  // 获取会话轮次分段快照（用于刷新恢复）
  getSnapshot: (sessionId: string) =>
    get<ApiResponse<TurnSegmentsSnapshot>>(`/turn-segmentation/session/${sessionId}`),
}

export const debugErrorApi = {
  // 获取会话的调试错误列表
  listBySession: (sessionId: string) =>
    get<ApiResponse<DebugError[]>>(`/debug-errors/session/${sessionId}`),
}
