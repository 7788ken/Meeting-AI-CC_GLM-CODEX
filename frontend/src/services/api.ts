import { http, type ApiResponse } from './http'

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

// ==================== 会话 API ====================

export const sessionApi = {
  // 创建会话
  create: (data?: { title?: string; description?: string }) =>
    http.post<ApiResponse<Session>>('/sessions', { settings: data }),

  // 结束会话
  end: (sessionId: string) =>
    http.post<ApiResponse<Session>>(`/sessions/${sessionId}/end`),

  // 存档会话
  archive: (sessionId: string) =>
    http.post<ApiResponse<Session>>(`/sessions/${sessionId}/archive`),

  // 取消存档
  unarchive: (sessionId: string) =>
    http.post<ApiResponse<Session>>(`/sessions/${sessionId}/unarchive`),

  // 获取会话详情
  get: (sessionId: string) =>
    http.get<ApiResponse<Session>>(`/sessions/${sessionId}`),

  // 获取所有会话
  list: () =>
    http.get<ApiResponse<Session[]>>('/sessions'),

  // 删除会话
  remove: (sessionId: string) =>
    http.delete<ApiResponse<{ deleted: boolean }>>(`/sessions/${sessionId}`),

  // 更新会话状态
  updateStatus: (sessionId: string, status: string) =>
    http.put<ApiResponse<Session>>(`/sessions/${sessionId}/status`, { status }),

  // 添加发言者
  addSpeaker: (sessionId: string, data: { name: string; avatarUrl?: string; color?: string }) =>
    http.post<ApiResponse<Speaker>>(`/sessions/${sessionId}/speakers`, data),

  // 获取发言者列表
  getSpeakers: (sessionId: string) =>
    http.get<ApiResponse<Speaker[]>>(`/sessions/${sessionId}/speakers`),
}

// ==================== 发言记录 API ====================

export const speechApi = {
  // 创建发言记录
  create: (data: Partial<Speech>) =>
    http.post<ApiResponse<Speech>>('/speeches', data),

  // 批量创建发言记录
  batchCreate: (data: Partial<Speech>[]) =>
    http.post<ApiResponse<Speech[]>>('/speeches/batch', data),

  // 获取发言详情
  get: (speechId: string) =>
    http.get<ApiResponse<Speech>>(`/speeches/${speechId}`),

  // 获取会话的所有发言
  list: (sessionId: string) =>
    http.get<ApiResponse<Speech[]>>(`/speeches/session/${sessionId}`),

  // 获取发言者的所有发言
  listBySpeaker: (sessionId: string, speakerId: string) =>
    http.get<ApiResponse<Speech[]>>(`/speeches/session/${sessionId}/speaker/${speakerId}`),

  // 搜索发言记录
  search: (sessionId: string, keyword: string) =>
    http.get<ApiResponse<Speech[]>>(`/speeches/session/${sessionId}/search?keyword=${keyword}`),

  // 更新发言
  update: (speechId: string, data: Partial<Speech>) =>
    http.put<ApiResponse<Speech>>(`/speeches/${speechId}`, data),

  // 标记/取消标记发言
  toggleMark: (speechId: string, marked: boolean, reason?: string) =>
    http.put<ApiResponse<Speech>>(`/speeches/${speechId}/mark`, { marked, reason }),

  // 删除会话的所有发言
  deleteBySession: (sessionId: string) =>
    http.delete(`/speeches/session/${sessionId}`),
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
    http.post<ApiResponse<AIAnalysis>>('/analysis/generate', data),

  // 获取或生成 AI 分析（使用缓存）
  getOrCreate: (data: AnalysisRequest) =>
    http.post<ApiResponse<AIAnalysis>>('/analysis/get-or-create', data),

  // 获取分析详情
  get: (analysisId: string) =>
    http.get<ApiResponse<AIAnalysis>>(`/analysis/${analysisId}`),

  // 获取会话的所有分析
  list: (sessionId: string) =>
    http.get<ApiResponse<AIAnalysis[]>>(`/analysis/session/${sessionId}`),

  // 获取会话的特定类型分析
  listByType: (sessionId: string, analysisType: string) =>
    http.get<ApiResponse<AIAnalysis[]>>(`/analysis/session/${sessionId}/type/${analysisType}`),

  // 删除会话的所有分析
  deleteBySession: (sessionId: string) =>
    http.delete(`/analysis/session/${sessionId}`),
}
