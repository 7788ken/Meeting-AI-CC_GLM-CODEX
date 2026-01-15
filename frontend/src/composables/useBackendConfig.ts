import { ref } from 'vue'
import { appConfigApi, type BackendConfig } from '@/services/api'

const fallbackDefaults: BackendConfig = {
  glmApiKey: '',
  glmEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  glmGlobalConcurrency: 1,
  glmGlobalMinIntervalMs: 500,
  glmGlobalRateLimitCooldownMs: 2000,
  glmGlobalRateLimitMaxMs: 15000,
  glmTranscriptSummaryModel: '',
  glmTranscriptSummaryMaxTokens: 2500,
  glmTranscriptSummaryThinking: true,
  glmTranscriptSummaryRetryMax: 3,
  glmTranscriptSummaryRetryBaseMs: 500,
  glmTranscriptSummaryRetryMaxMs: 8000,
}

const backendConfig = ref<BackendConfig>({ ...fallbackDefaults })
let defaults: BackendConfig = { ...fallbackDefaults }

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

async function refreshBackendConfig(): Promise<boolean> {
  try {
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
})
