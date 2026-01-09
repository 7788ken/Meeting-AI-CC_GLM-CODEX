import { http, type ApiResponse } from './http'

// 会话相关类型
export interface Session {
  id: string
  startedAt: string
  endedAt: string | null
  duration: number | null
  isActive: boolean
}

export interface CreateSessionResponse {
  session: Session
}

export interface EndSessionResponse {
  session: Session
}

// 会话API
export const sessionApi = {
  // 创建会话
  create: () => http.post<ApiResponse<CreateSessionResponse>>('/sessions'),

  // 结束会话
  end: (sessionId: string) =>
    http.post<ApiResponse<EndSessionResponse>>(`/sessions/${sessionId}/end`),

  // 获取会话详情
  get: (sessionId: string) =>
    http.get<ApiResponse<{ session: Session }>>(`/sessions/${sessionId}`),
}

// 发言记录类型
export interface Speech {
  id: string
  sessionId: string
  speakerId: string
  speakerName: string
  content: string
  startTime: string
  endTime: string
  duration: number
  confidence: number
  isEdited: boolean
  isMarked: boolean
}

// 发言API
export const speechApi = {
  // 获取会话的所有发言
  list: (sessionId: string) =>
    http.get<ApiResponse<{ speeches: Speech[] }>>(`/sessions/${sessionId}/speeches`),

  // 更新发言
  update: (speechId: string, data: Partial<Speech>) =>
    http.put<ApiResponse<{ speech: Speech }>>(`/speeches/${speechId}`, data),
}

// AI分析类型
export interface AIAnalysis {
  id: string
  speechId: string
  sessionId: string
  coreAnalysis: string
  briefAnswer: string
  deepAnswer: string
  modelUsed: string
  generatedAt: string
}

export interface AnalysisRequest {
  speechIds: string[]
  model?: string
  type?: 'core' | 'brief' | 'deep' | 'all'
}

// AI分析API
export const analysisApi = {
  // 生成AI分析
  generate: (data: AnalysisRequest) =>
    http.post<ApiResponse<{ analysis: AIAnalysis }>>('/analysis/generate', data),

  // 获取已生成的分析
  get: (analysisId: string) =>
    http.get<ApiResponse<{ analysis: AIAnalysis }>>(`/analysis/${analysisId}`),
}
