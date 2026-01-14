import { ref } from 'vue'
import { applyVadConfig, getVadConfig } from '@/services/transcription'
import { setApiBaseUrl } from '@/services/http'
import { websocket } from '@/services/websocket'

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
  if (!merged.promptTemplates || merged.promptTemplates.length === 0) errors.push('至少需要一个提示词模板')
  if (!merged.defaultPromptTemplateId) errors.push('默认提示词模板不能为空')
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

export const useAppSettings = () => ({
  settings,
  defaults,
  updateSettings,
  resetSettings,
  applySettings,
  validateSettings,
})
