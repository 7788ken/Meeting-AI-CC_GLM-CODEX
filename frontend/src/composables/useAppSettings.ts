import { ref } from 'vue'
import { applyVadConfig, getVadConfig } from '@/services/transcription'
import { setApiBaseUrl } from '@/services/http'
import { websocket } from '@/services/websocket'

export type AsrModel = 'doubao' | 'glm'

export interface AppSettings {
  asrModel: AsrModel
  vadStartTh: number
  vadStopTh: number
  vadGapMs: number
  vadConfirmMs: number
  analysisType: 'summary' | 'action-items' | 'sentiment' | 'keywords' | 'topics'
  apiBaseUrl: string
  wsUrl: string
}

const STORAGE_KEY = 'meeting-ai.app-settings'
const ALLOWED_ANALYSIS_TYPES: AppSettings['analysisType'][] = [
  'summary',
  'action-items',
  'sentiment',
  'keywords',
  'topics',
]

const resolveEnv = <T>(value: T | undefined, fallback: T): T =>
  (value === undefined || value === null || value === '' ? fallback : value)

const buildDefaultSettings = (): AppSettings => {
  const vad = getVadConfig()
  return {
    asrModel: resolveEnv(import.meta.env.VITE_ASR_MODEL as AsrModel, 'doubao'),
    vadStartTh: vad.startThreshold,
    vadStopTh: vad.stopThreshold,
    vadGapMs: vad.gapMs,
    vadConfirmMs: vad.confirmMs,
    analysisType: 'summary',
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
  const next: AppSettings = {
    asrModel: (input.asrModel === 'doubao' || input.asrModel === 'glm') ? input.asrModel : base.asrModel,
    vadStartTh: normalizeNumber(input.vadStartTh, base.vadStartTh, 0),
    vadStopTh: normalizeNumber(input.vadStopTh, base.vadStopTh, 0),
    vadGapMs: normalizeNumber(input.vadGapMs, base.vadGapMs, 0),
    vadConfirmMs: normalizeNumber(input.vadConfirmMs, base.vadConfirmMs, 0),
    analysisType: ALLOWED_ANALYSIS_TYPES.includes(input.analysisType as AppSettings['analysisType'])
      ? (input.analysisType as AppSettings['analysisType'])
      : base.analysisType,
    apiBaseUrl: input.apiBaseUrl?.trim() || base.apiBaseUrl,
    wsUrl: (input.wsUrl ?? base.wsUrl).trim(),
  }
  return next
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
