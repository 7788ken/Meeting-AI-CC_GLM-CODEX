import { get, post, put, del, type ApiResponse } from './http'
import { getSettingsAuthHeaders } from './settingsSecurity'

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
  translatedContent?: string
  translationStatus?: 'completed' | 'failed'
  translationError?: string
  translationModel?: string
  translationGeneratedAt?: string
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
  bumpMaxTokens: number
  retryMax: number
  retryBaseMs: number
  retryMaxMs: number
  degradeOnStrictFail: boolean
  maxSegmentsPerRun: number
}

export interface TranscriptAnalysisConfig {
  summaryPromptId: string
  chunkSummaryPromptId: string
  segmentAnalysisSystemPrompt: string
}

export type PromptTemplateType = 'summary' | 'chunk_summary'

export interface PromptTemplate {
  id: string
  name: string
  alias?: string
  type: PromptTemplateType
  content: string
  isDefault: boolean
  createdAt?: string
  updatedAt?: string
}

export type CreatePromptTemplatePayload = {
  name: string
  alias?: string
  type: PromptTemplateType
  content: string
  isDefault?: boolean
}

export type UpdatePromptTemplatePayload = {
  name?: string
  alias?: string
  content?: string
  isDefault?: boolean
}

export interface BackendConfig {
  glmApiKey: string
  glmEndpoint: string
  glmGlobalConcurrency: number
  glmGlobalMinIntervalMs: number
  glmGlobalRateLimitCooldownMs: number
  glmGlobalRateLimitMaxMs: number
  transcriptAutoSplitGapMs: number
  transcriptMaxBufferDurationSoftMs: number
  transcriptMaxBufferDurationHardMs: number
  transcriptDebugLogUtterances: boolean
  transcriptSegmentTranslationEnabled: boolean
  transcriptSegmentTranslationLanguage: string
  transcriptAnalysisLanguageEnabled: boolean
  transcriptAnalysisLanguage: string
  glmTranscriptSummaryModel: string
  glmTranscriptSummaryMaxTokens: number
  glmTranscriptSummaryThinking: boolean
  glmTranscriptSummaryRetryMax: number
  glmTranscriptSummaryRetryBaseMs: number
  glmTranscriptSummaryRetryMaxMs: number
}

export interface AppConfigSecurityStatus {
  enabled: boolean
}

export interface AppConfigSecurityVerifyResult {
  verified: boolean
}

export interface AppConfigSecurityUpdateResult {
  updated: boolean
}

export interface AppConfigRemark {
  key: string
  remark: string
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

// ==================== 语句针对性分析（Markdown） ====================

export interface TranscriptSegmentAnalysis {
  sessionId: string
  segmentId: string
  segmentSequence: number
  markdown: string
  model: string
  generatedAt: string
  sourceRevision: number
  sourceStartEventIndex: number
  sourceEndEventIndex: number
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
    get<ApiResponse<TranscriptEventSegmentationConfig>>('/transcript-event-segmentation/config', {
      headers: getSettingsAuthHeaders(),
    }),
  reset: () =>
    post<ApiResponse<TranscriptEventSegmentationConfig>>(
      '/transcript-event-segmentation/config/reset',
      {},
      { headers: getSettingsAuthHeaders() }
    ),
  update: (data: Partial<TranscriptEventSegmentationConfig>) =>
    put<ApiResponse<TranscriptEventSegmentationConfig>>(
      '/transcript-event-segmentation/config',
      data,
      { headers: getSettingsAuthHeaders() }
    ),
}

export const transcriptAnalysisConfigApi = {
  get: () =>
    get<ApiResponse<TranscriptAnalysisConfig>>('/transcript-analysis/config', {
      headers: getSettingsAuthHeaders(),
    }),
  reset: () =>
    post<ApiResponse<TranscriptAnalysisConfig>>(
      '/transcript-analysis/config/reset',
      {},
      { headers: getSettingsAuthHeaders() }
    ),
  update: (data: Partial<TranscriptAnalysisConfig>) =>
    put<ApiResponse<TranscriptAnalysisConfig>>(
      '/transcript-analysis/config',
      data,
      { headers: getSettingsAuthHeaders() }
    ),
}

export const promptLibraryApi = {
  list: () =>
    get<ApiResponse<PromptTemplate[]>>('/prompt-library', {
      headers: getSettingsAuthHeaders(),
    }),
  create: (data: CreatePromptTemplatePayload) =>
    post<ApiResponse<PromptTemplate>>('/prompt-library', data, {
      headers: getSettingsAuthHeaders(),
    }),
  update: (id: string, data: UpdatePromptTemplatePayload) =>
    put<ApiResponse<PromptTemplate>>(`/prompt-library/${id}`, data, {
      headers: getSettingsAuthHeaders(),
    }),
  remove: (id: string) =>
    del<ApiResponse<{ id: string }>>(`/prompt-library/${id}`, {
      headers: getSettingsAuthHeaders(),
    }),
}

export const appConfigApi = {
  get: () =>
    get<ApiResponse<BackendConfig>>('/app-config', { headers: getSettingsAuthHeaders() }),
  update: (data: Partial<BackendConfig>) =>
    put<ApiResponse<BackendConfig>>('/app-config', data, { headers: getSettingsAuthHeaders() }),
}

export const appConfigSecurityApi = {
  getStatus: () =>
    get<ApiResponse<AppConfigSecurityStatus>>('/app-config/security/status'),
  verify: (password: string) =>
    post<ApiResponse<AppConfigSecurityVerifyResult>>('/app-config/security/verify', { password }),
  updatePassword: (data: { password: string; currentPassword?: string }) =>
    put<ApiResponse<AppConfigSecurityUpdateResult>>('/app-config/security/password', data),
}

export const appConfigRemarksApi = {
  get: () => get<ApiResponse<AppConfigRemark[]>>('/app-config/remarks', { headers: getSettingsAuthHeaders() }),
}

export const transcriptAnalysisApi = {
  getStoredSummary: (sessionId: string) =>
    get<ApiResponse<TranscriptSummary | null>>(`/transcript-analysis/session/${sessionId}/summary`),
  generateSummary: (sessionId: string) =>
    post<ApiResponse<TranscriptSummary>>(`/transcript-analysis/session/${sessionId}/summary`, {}),
  getStoredSegmentAnalysis: (sessionId: string, segmentId: string) =>
    get<ApiResponse<TranscriptSegmentAnalysis | null>>(
      `/transcript-analysis/session/${sessionId}/segment/${segmentId}/analysis`
    ),
  generateSegmentAnalysis: (sessionId: string, segmentId: string) =>
    post<ApiResponse<TranscriptSegmentAnalysis>>(
      `/transcript-analysis/session/${sessionId}/segment/${segmentId}/analysis`,
      {}
    ),
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
