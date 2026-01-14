import { ref } from 'vue'
import { applyVadConfig, getVadConfig } from '@/services/transcription'
import { setApiBaseUrl } from '@/services/http'
import { websocket } from '@/services/websocket'
import { transcriptEventSegmentationConfigApi } from '@/services/api'

export type AsrModel = 'doubao' | 'glm'

export type PromptTemplate = {
  id: string
  name: string
  prompt: string
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  asrModel: AsrModel
  vadStartTh: number
  vadStopTh: number
  vadGapMs: number
  vadConfirmMs: number
  promptTemplates: PromptTemplate[]
  defaultPromptTemplateId: string
  activePromptTemplateId: string
  segmentationSystemPrompt: string
  segmentationWindowEvents: number
  segmentationIntervalMs: number
  segmentationTriggerOnEndTurn: boolean
  segmentationTriggerOnStopTranscribe: boolean
  segmentationModel: string
  segmentationMaxTokens: number
  segmentationJsonMode: boolean
  apiBaseUrl: string
  wsUrl: string
}

const STORAGE_KEY = 'meeting-ai.app-settings'

function buildDefaultPromptTemplates(now: string): PromptTemplate[] {
  return [
    {
      id: 'tpl_summary',
      name: '会议摘要',
      prompt:
        '请根据以下会议发言内容，生成一份简洁的会议摘要（Markdown）：\n\n{{speeches}}\n\n要求：\n1. 提取核心讨论内容\n2. 总结主要结论\n3. 用要点输出',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tpl_action_items',
      name: '行动项',
      prompt:
        '请从以下会议发言中提取行动项（Markdown 列表）：\n\n{{speeches}}\n\n要求：\n1. 列出所有需要执行的任务\n2. 标注负责人（如果有）\n3. 标注截止时间（如果有）',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tpl_full_report',
      name: '完整报告',
      prompt:
        '请根据以下会议发言生成完整会议报告（Markdown）：\n\n{{speeches}}\n\n结构：\n- 摘要\n- 主要议题\n- 结论\n- 行动项\n- 风险与待决问题',
      createdAt: now,
      updatedAt: now,
    },
  ]
}

const DEFAULT_SEGMENTATION_SYSTEM_PROMPT = [
  '你是“会议语句拆分器”。你的任务是：从 extractedText 的开头截取出“下一句/下一段”（尽量短且语义完整），并可做最小化断句与标点补全。',
  '',
  '强约束：',
  '- 只允许输出 JSON，禁止输出任何 Markdown、解释或多余文本。',
  '- 只输出一个字段：{ "nextSentence": "..." }',
  '- nextSentence 必须对应 extractedText 的一个【前缀】（从开头开始，连续截取）；允许在字符之间插入少量空格与标点以提升可读性。',
  '- 严禁新增/删除/替换 extractedText 中的任何汉字/字母/数字（包括语气词“啊”“呢”等），严禁改写、翻译、补全或总结。',
  '- 如果你无法严格遵守“只加标点不改字”，就直接原样输出 extractedText。',
  '- 参考句末标点：。！？?!；;',
  '',
  '示例（应该这样）：',
  '- extractedText 是“欢迎收听豆包AI播客节目。”时，nextSentence 直接输出“欢迎收听豆包AI播客节目。”。',
  '- extractedText 是“啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？”时，nextSentence 不得追加后续文本。',
  '',
  '输出 JSON 格式（必须严格匹配）：',
  '{ "nextSentence": "..." }',
].join('\n')

const resolveEnv = <T>(value: T | undefined, fallback: T): T =>
  (value === undefined || value === null || value === '' ? fallback : value)

const buildDefaultSettings = (): AppSettings => {
  const vad = getVadConfig()
  const now = new Date().toISOString()
  const templates = buildDefaultPromptTemplates(now)
  return {
    asrModel: resolveEnv(import.meta.env.VITE_ASR_MODEL as AsrModel, 'doubao'),
    vadStartTh: vad.startThreshold,
    vadStopTh: vad.stopThreshold,
    vadGapMs: vad.gapMs,
    vadConfirmMs: vad.confirmMs,
    promptTemplates: templates,
    defaultPromptTemplateId: templates[0]?.id || '',
    activePromptTemplateId: templates[0]?.id || '',
    segmentationSystemPrompt: DEFAULT_SEGMENTATION_SYSTEM_PROMPT,
    segmentationWindowEvents: 120,
    segmentationIntervalMs: 3000,
    segmentationTriggerOnEndTurn: true,
    segmentationTriggerOnStopTranscribe: true,
    segmentationModel: resolveEnv(
      import.meta.env.VITE_GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL as string,
      ''
    ),
    segmentationMaxTokens: 2000,
    segmentationJsonMode: true,
    apiBaseUrl:
      resolveEnv((globalThis as any).__VITE_API_BASE_URL__ as string, '') ||
      resolveEnv(import.meta.env.VITE_API_BASE_URL as string, '/api'),
    wsUrl:
      resolveEnv((globalThis as any).__VITE_WS_URL__ as string, '') ||
      resolveEnv(import.meta.env.VITE_WS_URL as string, ''),
  }
}

const defaults: AppSettings = buildDefaultSettings()

const settings = ref<AppSettings>(loadFromStorage() ?? defaults)

function loadFromStorage(): AppSettings | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return normalizeSettings(parsed, defaults)
  } catch {
    return null
  }
}

function persist(next: AppSettings) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 忽略持久化失败
  }
}

function normalizeNumber(value: unknown, fallback: number, min = 0): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed >= min) return parsed
  return fallback
}

function normalizeNumberInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    const rounded = Math.floor(parsed)
    if (rounded >= min && rounded <= max) return rounded
  }
  return fallback
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed ? trimmed : fallback
}

function normalizeSettings(input: Partial<AppSettings>, base: AppSettings): AppSettings {
  const templates = normalizePromptTemplates((input as any).promptTemplates, base.promptTemplates)
  const defaultTemplateId = normalizeTemplateId((input as any).defaultPromptTemplateId, templates, base.defaultPromptTemplateId)
  const activeTemplateId = normalizeTemplateId((input as any).activePromptTemplateId, templates, defaultTemplateId)

  const next: AppSettings = {
    asrModel: (input.asrModel === 'doubao' || input.asrModel === 'glm') ? input.asrModel : base.asrModel,
    vadStartTh: normalizeNumber(input.vadStartTh, base.vadStartTh, 0),
    vadStopTh: normalizeNumber(input.vadStopTh, base.vadStopTh, 0),
    vadGapMs: normalizeNumber(input.vadGapMs, base.vadGapMs, 0),
    vadConfirmMs: normalizeNumber(input.vadConfirmMs, base.vadConfirmMs, 0),
    promptTemplates: templates,
    defaultPromptTemplateId: defaultTemplateId,
    activePromptTemplateId: activeTemplateId,
    segmentationSystemPrompt: normalizeText(
      (input as any).segmentationSystemPrompt,
      base.segmentationSystemPrompt
    ),
    segmentationWindowEvents: normalizeNumberInRange(
      (input as any).segmentationWindowEvents,
      base.segmentationWindowEvents,
      5,
      2000
    ),
    segmentationIntervalMs: normalizeNumberInRange(
      (input as any).segmentationIntervalMs,
      base.segmentationIntervalMs,
      0,
      10 * 60 * 1000
    ),
    segmentationTriggerOnEndTurn: normalizeBoolean(
      (input as any).segmentationTriggerOnEndTurn,
      base.segmentationTriggerOnEndTurn
    ),
    segmentationTriggerOnStopTranscribe: normalizeBoolean(
      (input as any).segmentationTriggerOnStopTranscribe,
      base.segmentationTriggerOnStopTranscribe
    ),
    segmentationModel: normalizeText((input as any).segmentationModel, base.segmentationModel),
    segmentationMaxTokens: normalizeNumberInRange(
      (input as any).segmentationMaxTokens,
      base.segmentationMaxTokens,
      256,
      8192
    ),
    segmentationJsonMode: normalizeBoolean(
      (input as any).segmentationJsonMode,
      base.segmentationJsonMode
    ),
    apiBaseUrl: input.apiBaseUrl?.trim() || base.apiBaseUrl,
    wsUrl: (input.wsUrl ?? base.wsUrl).trim(),
  }
  return next
}

function normalizePromptTemplates(value: unknown, fallback: PromptTemplate[]): PromptTemplate[] {
  if (!Array.isArray(value)) return fallback
  const now = new Date().toISOString()
  const templates: PromptTemplate[] = []

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const input = raw as Partial<PromptTemplate>
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const prompt = typeof input.prompt === 'string' ? input.prompt : ''
    if (!id || !name) continue
    templates.push({
      id,
      name,
      prompt,
      createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : now,
      updatedAt: typeof input.updatedAt === 'string' && input.updatedAt ? input.updatedAt : now,
    })
  }

  return templates.length > 0 ? templates : fallback
}

function normalizeTemplateId(
  value: unknown,
  templates: PromptTemplate[],
  fallback: string
): string {
  const candidate = typeof value === 'string' ? value.trim() : ''
  if (candidate && templates.some((t) => t.id === candidate)) return candidate
  if (fallback && templates.some((t) => t.id === fallback)) return fallback
  return templates[0]?.id || ''
}

function applySettings(next?: AppSettings) {
  const target = next ?? settings.value
  ;(globalThis as any).__VITE_API_BASE_URL__ = target.apiBaseUrl
  setApiBaseUrl(target.apiBaseUrl)
  if (target.wsUrl) {
    ;(globalThis as any).__VITE_WS_URL__ = target.wsUrl
    websocket.setUrl(target.wsUrl)
  }
  applyVadConfig({
    startThreshold: target.vadStartTh,
    stopThreshold: target.vadStopTh,
    gapMs: target.vadGapMs,
    confirmMs: target.vadConfirmMs,
  })
}

function validateSettings(input: Partial<AppSettings> | AppSettings): string[] {
  const merged = normalizeSettings(input, settings.value)
  const errors: string[] = []

  if (merged.vadStartTh <= 0) errors.push('起始能量阈值必须大于 0')
  if (merged.vadStopTh < 0) errors.push('停止阈值不能为负数')
  if (merged.vadGapMs < 0) errors.push('静音间隔必须为非负数')
  if (merged.vadConfirmMs < 0) errors.push('确认延迟必须为非负数')
  if (!merged.promptTemplates || merged.promptTemplates.length === 0) errors.push('至少需要一个 AI 分析提示词模板')
  if (!merged.defaultPromptTemplateId) errors.push('默认 AI 分析提示词模板不能为空')
  if (!merged.segmentationSystemPrompt) errors.push('语句拆分提示词不能为空')
  if (merged.segmentationWindowEvents < 5) errors.push('语句拆分上下文窗口事件数至少为 5')
  if (merged.segmentationIntervalMs < 0) errors.push('语句拆分触发间隔不能为负数')
  if (!merged.segmentationModel) errors.push('语句拆分模型不能为空')
  if (merged.segmentationMaxTokens < 256) errors.push('语句拆分最大 tokens 不能小于 256')
  if (!merged.apiBaseUrl) errors.push('API 基础地址不能为空')
  return errors
}

function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const next = normalizeSettings(partial, settings.value)
  settings.value = next
  persist(next)
  applySettings(next)
  return next
}

function resetSettings(): AppSettings {
  settings.value = { ...defaults }
  persist(settings.value)
  applySettings(settings.value)
  return settings.value
}

// 初始化时应用一次
applySettings(settings.value)

async function refreshSegmentationConfigFromServer(): Promise<boolean> {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return false
  try {
    const response = await transcriptEventSegmentationConfigApi.get()
    const serverConfig = response?.data
    if (!serverConfig) return false

    updateSettings({
      segmentationSystemPrompt: serverConfig.systemPrompt,
      segmentationWindowEvents: serverConfig.windowEvents,
      segmentationIntervalMs: serverConfig.intervalMs,
      segmentationTriggerOnEndTurn: serverConfig.triggerOnEndTurn,
      segmentationTriggerOnStopTranscribe: serverConfig.triggerOnStopTranscribe,
      segmentationModel: serverConfig.model,
      segmentationMaxTokens: serverConfig.maxTokens,
      segmentationJsonMode: serverConfig.jsonMode,
    })
    return true
  } catch {
    return false
  }
}

// 用后端配置覆盖一次（后端默认来自 .env）
void refreshSegmentationConfigFromServer()

export const useAppSettings = () => ({
  settings,
  defaults,
  updateSettings,
  resetSettings,
  applySettings,
  validateSettings,
  refreshSegmentationConfigFromServer,
})
