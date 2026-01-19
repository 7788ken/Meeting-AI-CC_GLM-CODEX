import { ref } from 'vue'
import { applyVadConfig, getVadConfig } from '@/services/transcription'
import { setApiBaseUrl } from '@/services/http'
import { websocket } from '@/services/websocket'

export type AsrModel = 'glm'
export type AudioCaptureMode = 'mic' | 'tab' | 'mix'

export interface AppSettings {
  asrModel: AsrModel
  micDeviceId: string
  audioCaptureMode: AudioCaptureMode
  vadStartTh: number
  vadStopTh: number
  vadGapMs: number
  transcriptFontSize: number
  segmentFontSize: number
  analysisFontSize: number
  apiBaseUrl: string
  wsUrl: string
}

type RuntimeEnv = {
  __VITE_API_BASE_URL__?: string
  __VITE_WS_URL__?: string
}

const runtimeEnv = globalThis as RuntimeEnv

const STORAGE_KEY = 'meeting-ai.app-settings'
const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 24

const resolveEnv = <T>(value: T | undefined, fallback: T): T =>
  value === undefined || value === null || value === '' ? fallback : value

const buildDefaultSettings = (): AppSettings => {
  const vad = getVadConfig()
  return {
    asrModel: 'glm',
    micDeviceId: '',
    audioCaptureMode: 'mic',
    vadStartTh: vad.startThreshold,
    vadStopTh: vad.stopThreshold,
    vadGapMs: vad.gapMs,
    transcriptFontSize: 13,
    segmentFontSize: 16,
    analysisFontSize: 16,
    apiBaseUrl:
      resolveEnv(runtimeEnv.__VITE_API_BASE_URL__, '') ||
      resolveEnv(import.meta.env.VITE_API_BASE_URL, '/api'),
    wsUrl:
      resolveEnv(runtimeEnv.__VITE_WS_URL__, '') || resolveEnv(import.meta.env.VITE_WS_URL, ''),
  }
}

const fallbackDefaults: AppSettings = buildDefaultSettings()

const settings = ref<AppSettings>(fallbackDefaults)
const defaults: AppSettings = { ...fallbackDefaults }

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

function normalizeSettings(input: Partial<AppSettings>, base: AppSettings): AppSettings {
  const audioCaptureModeRaw =
    typeof input.audioCaptureMode === 'string' ? input.audioCaptureMode.trim() : ''
  const audioCaptureMode: AudioCaptureMode =
    audioCaptureModeRaw === 'tab' || audioCaptureModeRaw === 'mix' || audioCaptureModeRaw === 'mic'
      ? (audioCaptureModeRaw as AudioCaptureMode)
      : base.audioCaptureMode

  const next: AppSettings = {
    asrModel: 'glm',
    micDeviceId:
      typeof input.micDeviceId === 'string' ? input.micDeviceId.trim() : base.micDeviceId,
    audioCaptureMode,
    vadStartTh: normalizeNumber(input.vadStartTh, base.vadStartTh, 0),
    vadStopTh: normalizeNumber(input.vadStopTh, base.vadStopTh, 0),
    vadGapMs: normalizeNumber(input.vadGapMs, base.vadGapMs, 0),
    transcriptFontSize: normalizeNumberInRange(
      input.transcriptFontSize,
      base.transcriptFontSize,
      FONT_SIZE_MIN,
      FONT_SIZE_MAX
    ),
    segmentFontSize: normalizeNumberInRange(
      input.segmentFontSize,
      base.segmentFontSize,
      FONT_SIZE_MIN,
      FONT_SIZE_MAX
    ),
    analysisFontSize: normalizeNumberInRange(
      input.analysisFontSize,
      base.analysisFontSize,
      FONT_SIZE_MIN,
      FONT_SIZE_MAX
    ),
    apiBaseUrl: typeof input.apiBaseUrl === 'string' ? input.apiBaseUrl.trim() : base.apiBaseUrl,
    wsUrl: typeof input.wsUrl === 'string' ? input.wsUrl.trim() : base.wsUrl,
  }
  return next
}

function applySettings(next?: AppSettings) {
  const target = next ?? settings.value
  runtimeEnv.__VITE_API_BASE_URL__ = target.apiBaseUrl
  setApiBaseUrl(target.apiBaseUrl)
  if (target.wsUrl) {
    runtimeEnv.__VITE_WS_URL__ = target.wsUrl
    websocket.setUrl(target.wsUrl)
  }
  applyVadConfig({
    startThreshold: target.vadStartTh,
    stopThreshold: target.vadStopTh,
    gapMs: target.vadGapMs,
  })
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.style.setProperty('--app-transcript-font-size', `${target.transcriptFontSize}px`)
    root.style.setProperty('--app-segment-font-size', `${target.segmentFontSize}px`)
    root.style.setProperty('--app-analysis-font-size', `${target.analysisFontSize}px`)
  }
}

function validateSettings(input: Partial<AppSettings> | AppSettings): string[] {
  const merged = normalizeSettings(input, settings.value)
  const errors: string[] = []

  if (!merged.audioCaptureMode) errors.push('录音来源不能为空')
  if (merged.vadStartTh <= 0) errors.push('起始能量阈值必须大于 0')
  if (merged.vadStopTh < 0) errors.push('停止阈值不能为负数')
  if (merged.vadGapMs < 0) errors.push('静音间隔必须为非负数')
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

// 初始化：仅从本地缓存恢复“客户端运行参数”（不包含后端运行参数）
const stored = loadFromStorage()
if (stored) {
  settings.value = stored
}
applySettings(settings.value)

export const useAppSettings = () => ({
  settings,
  get defaults() {
    return defaults
  },
  updateSettings,
  resetSettings,
  applySettings,
  validateSettings,
})
