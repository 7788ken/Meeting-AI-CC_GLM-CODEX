import { ref } from 'vue'
import { applyVadConfig, getVadConfig } from '@/services/transcription'
import { setApiBaseUrl } from '@/services/http'
import { websocket } from '@/services/websocket'
import { transcriptEventSegmentationConfigApi } from '@/services/api'

export type AsrModel = 'glm'
export type AudioCaptureMode = 'mic' | 'tab' | 'mix'

export interface AppSettings {
  asrModel: AsrModel
  micDeviceId: string
  audioCaptureMode: AudioCaptureMode
  vadStartTh: number
  vadStopTh: number
  vadGapMs: number
  segmentationSystemPrompt: string
  segmentationWindowEvents: number
  segmentationIntervalMs: number
  segmentationTriggerOnStopTranscribe: boolean
  segmentationModel: string
  segmentationMaxTokens: number
  segmentationJsonMode: boolean
  apiBaseUrl: string
  wsUrl: string
}

const STORAGE_KEY = 'meeting-ai.app-settings'

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
  '- extractedText 是“欢迎收听AI播客节目。”时，nextSentence 直接输出“欢迎收听AI播客节目。”。',
  '- extractedText 是“啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？”时，nextSentence 不得追加后续文本。',
  '',
  '输出 JSON 格式（必须严格匹配）：',
  '{ "nextSentence": "..." }',
].join('\n')

const resolveEnv = <T>(value: T | undefined, fallback: T): T =>
  (value === undefined || value === null || value === '' ? fallback : value)

const buildDefaultSettings = (): AppSettings => {
  const vad = getVadConfig()
  return {
    asrModel: 'glm',
    micDeviceId: '',
    audioCaptureMode: 'mic',
    vadStartTh: vad.startThreshold,
    vadStopTh: vad.stopThreshold,
    vadGapMs: vad.gapMs,
    segmentationSystemPrompt: DEFAULT_SEGMENTATION_SYSTEM_PROMPT,
    segmentationWindowEvents: 120, // 降级默认值，实际从后端 API 获取
    segmentationIntervalMs: 3000,
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

const fallbackDefaults: AppSettings = buildDefaultSettings()

let settings = ref<AppSettings>(fallbackDefaults)
let defaults: AppSettings = { ...fallbackDefaults }
let initialized = false

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
  const audioCaptureModeRaw = typeof (input as any).audioCaptureMode === 'string' ? String((input as any).audioCaptureMode).trim() : ''
  const audioCaptureMode: AudioCaptureMode =
    audioCaptureModeRaw === 'tab' || audioCaptureModeRaw === 'mix' || audioCaptureModeRaw === 'mic'
      ? (audioCaptureModeRaw as AudioCaptureMode)
      : base.audioCaptureMode

  const next: AppSettings = {
    asrModel: 'glm',
    micDeviceId: typeof (input as any).micDeviceId === 'string' ? (input as any).micDeviceId.trim() : base.micDeviceId,
    audioCaptureMode,
    vadStartTh: normalizeNumber(input.vadStartTh, base.vadStartTh, 0),
    vadStopTh: normalizeNumber(input.vadStopTh, base.vadStopTh, 0),
    vadGapMs: normalizeNumber(input.vadGapMs, base.vadGapMs, 0),
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
  })
}

function validateSettings(input: Partial<AppSettings> | AppSettings): string[] {
  const merged = normalizeSettings(input, settings.value)
  const errors: string[] = []

  if (!merged.audioCaptureMode) errors.push('录音来源不能为空')
  if (merged.vadStartTh <= 0) errors.push('起始能量阈值必须大于 0')
  if (merged.vadStopTh < 0) errors.push('停止阈值不能为负数')
  if (merged.vadGapMs < 0) errors.push('静音间隔必须为非负数')
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

async function refreshSegmentationConfigFromServer(): Promise<boolean> {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return false
  try {
    const response = await transcriptEventSegmentationConfigApi.get()
    const serverConfig = response?.data
    if (!serverConfig) return false

    const serverDefaults: Partial<AppSettings> = {
      segmentationSystemPrompt: serverConfig.systemPrompt,
      segmentationWindowEvents: serverConfig.windowEvents,
      segmentationIntervalMs: serverConfig.intervalMs,
      segmentationTriggerOnStopTranscribe: serverConfig.triggerOnStopTranscribe,
      segmentationModel: serverConfig.model,
      segmentationMaxTokens: serverConfig.maxTokens,
      segmentationJsonMode: serverConfig.jsonMode,
    }

    // 更新默认值为后端配置
    defaults = normalizeSettings(serverDefaults, fallbackDefaults)

    // 首次加载（localStorage 为空）时，直接使用后端配置作为初始值
    if (!initialized) {
      initialized = true
      const stored = loadFromStorage()
      if (!stored) {
        settings.value = { ...defaults }
        persist(settings.value)
        applySettings(settings.value)
        return true
      }
      settings.value = stored
      applySettings(settings.value)
      return true
    }

    // 非首次加载，只更新默认值，不覆盖用户已保存的设置
    return true
  } catch {
    return false
  }
}

// 初始化：先从后端获取配置，再设置初始值
refreshSegmentationConfigFromServer().catch(() => {
  // 后端配置获取失败，使用降级默认值
  const stored = loadFromStorage()
  if (stored) {
    settings.value = stored
  }
  initialized = true
  applySettings(settings.value)
})

export const useAppSettings = () => ({
  settings,
  get defaults() { return defaults },
  updateSettings,
  resetSettings,
  applySettings,
  validateSettings,
  refreshSegmentationConfigFromServer,
})
