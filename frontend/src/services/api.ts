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
  content: string
  confidence: number
  startTime: string
  endTime: string
  duration: number
  isEdited: boolean
  isMarked: boolean
  audioOffset?: number
}

// ==================== 原文事件流（Phase 0/1） ====================

export interface TranscriptEvent {
  eventIndex: number
  content: string
  isFinal: boolean
  segmentKey?: string
  asrTimestampMs?: number
  audioDurationMs?: number
}

export interface TranscriptStreamSnapshot {
  sessionId: string
  revision: number
  nextEventIndex: number
  events: TranscriptEvent[]
}

// ==================== 语句拆分（transcript_events_segments） ====================

export interface TranscriptEventSegment {
  id: string
  sessionId: string
  sequence: number
  content: string
  sourceStartEventIndex: number
  sourceEndEventIndex: number
  sourceStartEventIndexExact?: number
  sourceStartEventOffset?: number
  sourceEndEventIndexExact?: number
  sourceEndEventOffset?: number
  sourceRevision: number
  prevSegmentId?: string
  status: 'completed' | 'failed'
  error?: string
  model?: string
  generatedAt?: string
  createdAt?: string
}

export interface TranscriptEventSegmentsSnapshot {
  sessionId: string
  segments: TranscriptEventSegment[]
}

export interface TranscriptEventSegmentationConfig {
  systemPrompt: string
  strictSystemPrompt: string
  windowEvents: number
  intervalMs: number
  triggerOnStopTranscribe: boolean
  model: string
  maxTokens: number
  jsonMode: boolean
}

// ==================== 全文分析总结（Markdown） ====================

export interface TranscriptSummary {
  sessionId: string
  markdown: string
  model: string
  generatedAt: string
  sourceRevision: number
  sourceEventCount: number
  mode: 'single' | 'chunked'
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

export const transcriptStreamApi = {
  // 获取会话原文事件流快照（用于刷新恢复）
  getSnapshot: (sessionId: string, limit?: number) => {
    const query = limit == null ? '' : `?limit=${encodeURIComponent(String(limit))}`
    return get<ApiResponse<TranscriptStreamSnapshot>>(`/transcript-stream/session/${sessionId}${query}`)
  },
}

export const transcriptEventSegmentationApi = {
  // 获取会话语句拆分快照（用于刷新恢复）
  getSnapshot: (sessionId: string) =>
    get<ApiResponse<TranscriptEventSegmentsSnapshot>>(
      `/transcript-event-segmentation/session/${sessionId}`
    ),
  // 重拆：清空并从事件 1 重新生成语句拆分结果
  rebuild: (sessionId: string) =>
    post<ApiResponse<{ started: boolean }>>(
      `/transcript-event-segmentation/session/${sessionId}/rebuild`,
      {}
    ),
}

export const transcriptEventSegmentationConfigApi = {
  get: () =>
    get<ApiResponse<TranscriptEventSegmentationConfig>>('/transcript-event-segmentation/config'),
  reset: () =>
    post<ApiResponse<TranscriptEventSegmentationConfig>>(
      '/transcript-event-segmentation/config/reset',
      {}
    ),
  update: (data: Partial<TranscriptEventSegmentationConfig>) =>
    put<ApiResponse<TranscriptEventSegmentationConfig>>(
      '/transcript-event-segmentation/config',
      data
    ),
}

export const transcriptAnalysisApi = {
  generateSummary: (sessionId: string) =>
    post<ApiResponse<TranscriptSummary>>(`/transcript-analysis/session/${sessionId}/summary`, {}),
}

export const debugErrorApi = {
  // 获取会话的调试错误列表
  listBySession: (sessionId: string) =>
    get<ApiResponse<DebugError[]>>(`/debug-errors/session/${sessionId}`),
  // 获取单条调试错误详情
  getById: (id: string) =>
    get<ApiResponse<DebugError>>(`/debug-errors/${id}`),
  // 清空会话的调试错误列表
  clearBySession: (sessionId: string) =>
    del<ApiResponse<{ deletedCount: number }>>(`/debug-errors/session/${sessionId}`),
}
