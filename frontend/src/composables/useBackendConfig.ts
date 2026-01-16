import { ref } from 'vue'
import { appConfigApi, appConfigSecurityApi, type BackendConfig } from '@/services/api'
import { getSettingsPassword } from '@/services/settingsSecurity'

const fallbackDefaults: BackendConfig = {
  glmApiKey: '',
  glmEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  glmGlobalConcurrency: 1,
  glmGlobalMinIntervalMs: 500,
  glmGlobalRateLimitCooldownMs: 2000,
  glmGlobalRateLimitMaxMs: 15000,
  transcriptAutoSplitGapMs: 2500,
  transcriptMaxBufferDurationSoftMs: 30000,
  transcriptMaxBufferDurationHardMs: 50000,
  transcriptDebugLogUtterances: false,
  transcriptSegmentTranslationEnabled: false,
  transcriptSegmentTranslationLanguage: '简体中文',
  transcriptAnalysisLanguageEnabled: true,
  transcriptAnalysisLanguage: '简体中文',
  glmTranscriptSummaryModel: '',
  glmTranscriptSummaryMaxTokens: 2500,
  glmTranscriptSummaryThinking: true,
  glmTranscriptSummaryRetryMax: 3,
  glmTranscriptSummaryRetryBaseMs: 500,
  glmTranscriptSummaryRetryMaxMs: 8000,
}

const backendConfig = ref<BackendConfig>({ ...fallbackDefaults })
let defaults: BackendConfig = { ...fallbackDefaults }

async function canAccessBackendConfig(): Promise<boolean> {
  const password = getSettingsPassword().trim()
  if (password) return true
  try {
    const status = await appConfigSecurityApi.getStatus()
    return status?.data?.enabled !== true
  } catch {
    return false
  }
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
  return value.trim()
}

function normalizeBackendConfig(
  input: Partial<BackendConfig>,
  base: BackendConfig
): BackendConfig {
  const transcriptMaxBufferDurationSoftMs = normalizeNumberInRange(
    input.transcriptMaxBufferDurationSoftMs,
    base.transcriptMaxBufferDurationSoftMs,
    5000,
    59000
  )
  const transcriptMaxBufferDurationHardMsCandidate = normalizeNumberInRange(
    input.transcriptMaxBufferDurationHardMs,
    base.transcriptMaxBufferDurationHardMs,
    5000,
    59000
  )
  return {
    glmApiKey: normalizeText(input.glmApiKey, base.glmApiKey),
    glmEndpoint: normalizeText(input.glmEndpoint, base.glmEndpoint),
    glmGlobalConcurrency: normalizeNumberInRange(
      input.glmGlobalConcurrency,
      base.glmGlobalConcurrency,
      1,
      50
    ),
    glmGlobalMinIntervalMs: normalizeNumberInRange(
      input.glmGlobalMinIntervalMs,
      base.glmGlobalMinIntervalMs,
      0,
      60000
    ),
    glmGlobalRateLimitCooldownMs: normalizeNumberInRange(
      input.glmGlobalRateLimitCooldownMs,
      base.glmGlobalRateLimitCooldownMs,
      0,
      120000
    ),
    glmGlobalRateLimitMaxMs: normalizeNumberInRange(
      input.glmGlobalRateLimitMaxMs,
      base.glmGlobalRateLimitMaxMs,
      0,
      300000
    ),
    transcriptAutoSplitGapMs: normalizeNumberInRange(
      input.transcriptAutoSplitGapMs,
      base.transcriptAutoSplitGapMs,
      0,
      600000
    ),
    transcriptMaxBufferDurationSoftMs,
    transcriptMaxBufferDurationHardMs: Math.max(
      transcriptMaxBufferDurationSoftMs,
      transcriptMaxBufferDurationHardMsCandidate
    ),
    transcriptDebugLogUtterances: normalizeBoolean(
      input.transcriptDebugLogUtterances,
      base.transcriptDebugLogUtterances
    ),
    transcriptSegmentTranslationEnabled: normalizeBoolean(
      input.transcriptSegmentTranslationEnabled,
      base.transcriptSegmentTranslationEnabled
    ),
    transcriptSegmentTranslationLanguage:
      normalizeText(input.transcriptSegmentTranslationLanguage, base.transcriptSegmentTranslationLanguage) ||
      base.transcriptSegmentTranslationLanguage,
    transcriptAnalysisLanguageEnabled: normalizeBoolean(
      input.transcriptAnalysisLanguageEnabled,
      base.transcriptAnalysisLanguageEnabled
    ),
    transcriptAnalysisLanguage:
      normalizeText(input.transcriptAnalysisLanguage, base.transcriptAnalysisLanguage) ||
      base.transcriptAnalysisLanguage,
    glmTranscriptSummaryModel: normalizeText(
      input.glmTranscriptSummaryModel,
      base.glmTranscriptSummaryModel
    ),
    glmTranscriptSummaryMaxTokens: normalizeNumberInRange(
      input.glmTranscriptSummaryMaxTokens,
      base.glmTranscriptSummaryMaxTokens,
      256,
      8192
    ),
    glmTranscriptSummaryThinking: normalizeBoolean(
      input.glmTranscriptSummaryThinking,
      base.glmTranscriptSummaryThinking
    ),
    glmTranscriptSummaryRetryMax: normalizeNumberInRange(
      input.glmTranscriptSummaryRetryMax,
      base.glmTranscriptSummaryRetryMax,
      0,
      10
    ),
    glmTranscriptSummaryRetryBaseMs: normalizeNumberInRange(
      input.glmTranscriptSummaryRetryBaseMs,
      base.glmTranscriptSummaryRetryBaseMs,
      0,
      60000
    ),
    glmTranscriptSummaryRetryMaxMs: normalizeNumberInRange(
      input.glmTranscriptSummaryRetryMaxMs,
      base.glmTranscriptSummaryRetryMaxMs,
      0,
      120000
    ),
  }
}

function validateBackendConfig(input: Partial<BackendConfig> | BackendConfig): string[] {
  const errors: string[] = []

  const endpoint = typeof input.glmEndpoint === 'string' ? input.glmEndpoint.trim() : ''
  if (endpoint) {
    try {
      const url = new URL(endpoint)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        errors.push('GLM Endpoint 必须为 http/https URL')
      }
    } catch {
      errors.push('GLM Endpoint 不是合法 URL')
    }
  }

  const soft = Number((input as any).transcriptMaxBufferDurationSoftMs)
  const hard = Number((input as any).transcriptMaxBufferDurationHardMs)
  if (Number.isFinite(soft) && Number.isFinite(hard) && hard < soft) {
    errors.push('音频 buffer 硬上限必须大于等于软上限')
  }

  const translationEnabled = (input as any).transcriptSegmentTranslationEnabled === true
  const translationLanguage =
    typeof (input as any).transcriptSegmentTranslationLanguage === 'string'
      ? (input as any).transcriptSegmentTranslationLanguage.trim()
      : ''
  if (translationEnabled && !translationLanguage) {
    errors.push('语句翻译目标语言不能为空')
  }

  const analysisLanguageEnabled = (input as any).transcriptAnalysisLanguageEnabled === true
  const analysisLanguage =
    typeof (input as any).transcriptAnalysisLanguage === 'string'
      ? (input as any).transcriptAnalysisLanguage.trim()
      : ''
  if (analysisLanguageEnabled && !analysisLanguage) {
    errors.push('AI 分析目标语言不能为空')
  }

  return errors
}

async function refreshBackendConfig(): Promise<boolean> {
  try {
    if (!(await canAccessBackendConfig())) return false
    const response = await appConfigApi.get()
    const data = response?.data
    if (!data) return false
    const normalized = normalizeBackendConfig(data, defaults)
    defaults = { ...normalized }
    backendConfig.value = normalized
    return true
  } catch {
    return false
  }
}

async function updateBackendConfig(input: Partial<BackendConfig>): Promise<boolean> {
  try {
    if (!(await canAccessBackendConfig())) return false
    const normalized = normalizeBackendConfig(input, backendConfig.value)
    const response = await appConfigApi.update(normalized)
    const data = response?.data ?? normalized
    backendConfig.value = normalizeBackendConfig(data, defaults)
    return true
  } catch {
    return false
  }
}

export const useBackendConfig = () => ({
  backendConfig,
  get defaults() {
    return defaults
  },
  refreshBackendConfig,
  updateBackendConfig,
  validateBackendConfig,
})
