<template>
  <div class="ops-screen">
    <header class="ops-hero-compact">
      <!-- 顶部栏：eyebrow + 快捷状态 -->
      <div class="hero-compact-top">
        <span class="eyebrow">运行中控 · 系统观测</span>
        <div class="hero-compact-quick">
          <div class="quick-badge" :class="{ clickable: true }" @click="openSettingsDrawer">
            <span class="quick-badge-icon">{{ configReady ? '✓' : '⚠' }}</span>
            <span class="quick-badge-label">{{ configReady ? '已授权' : '未授权' }}</span>
          </div>
          <div class="quick-badge">
            <span class="quick-badge-icon">⏱</span>
            <span class="quick-badge-label">{{ formatDuration(globalCooldownRemainingMs) }}</span>
          </div>
        </div>
      </div>

      <!-- 标题行 -->
      <div class="hero-compact-title">
        <h1>并发请求运行中控大屏</h1>
        <span class="divider">|</span>
        <p class="sub">聚焦系统实时运作、队列压力与事件链路状态，面向运行时监控与决策。</p>
      </div>

      <!-- 指标卡片区：6列紧凑网格 -->
      <div class="hero-compact-metrics">
        <div class="metric-card" :class="`metric-${queueHealth.level}`">
          <div class="metric-header">
            <span class="metric-label">总排队</span>
            <span v-if="queueHealth.label" class="metric-badge" :class="queueHealth.level">{{ queueHealth.label }}</span>
          </div>
          <span class="metric-value">{{ totalPending }}</span>
        </div>

        <div class="metric-card metric-neutral">
          <div class="metric-header">
            <span class="metric-label">执行中</span>
          </div>
          <span class="metric-value">{{ totalInFlight }}/{{ bucketConfig.global.concurrency }}</span>
          <span class="metric-hint">并发上限</span>
        </div>

        <div class="metric-card metric-neutral">
          <div class="metric-header">
            <span class="metric-label">活动会话</span>
          </div>
          <span class="metric-value">{{ activeSessionCount }}</span>
          <span class="metric-hint">正在运行</span>
        </div>

        <div class="metric-card metric-neutral">
          <div class="metric-header">
            <span class="metric-label">最近刷新</span>
          </div>
          <span class="metric-value">{{ lastRefreshLabel }}</span>
          <span class="metric-hint">已同步</span>
        </div>

        <div class="metric-card" :class="`metric-${queueHealth.level}`">
          <div class="metric-header">
            <span class="metric-label">队列压力</span>
          </div>
          <span class="metric-value">{{ queueHealth.label }}</span>
          <span class="metric-hint">总排队 {{ totalPending }}</span>
        </div>

        <div class="metric-card metric-neutral">
          <div class="metric-header">
            <span class="metric-label">调度频率</span>
          </div>
          <span class="metric-value">{{ formatDuration(bucketConfig.global.minIntervalMs) }}</span>
          <span class="metric-hint">全局间隔</span>
        </div>
      </div>
    </header>

    <section class="ops-grid">
      <div class="panel queues">
        <div class="panel-title">
          <span>队列监控</span>
          <span class="note">全局与分桶</span>
        </div>
        <div class="queue-grid">
          <div v-for="bucket in queueCards" :key="bucket.key" class="queue-card" :style="{ '--accent': bucket.color }">
            <div class="queue-head">
              <span class="queue-title">{{ bucket.label }}</span>
              <span class="queue-state" :class="bucket.status">{{ bucket.statusLabel }}</span>
            </div>
            <div class="queue-metrics">
              <div>
                <span class="metric-label">排队</span>
                <span class="metric-value fontsize-30 color-red" >{{ bucket.queue }}</span>
              </div>
              <div>
                <span class="metric-label">冷却</span>
                <span class="metric-value fontsize-30">{{ formatDuration(bucket.cooldownRemainingMs) }}</span>
              </div>
              <div>
                <span class="metric-label">延迟 P50</span>
                <span class="metric-value">{{ formatDuration(bucket.queueDelayP50Ms) }}</span>
              </div>
              <div>
                <span class="metric-label">耗时 P95</span>
                <span class="metric-value">{{ formatDuration(bucket.durationP95Ms) }}</span>
              </div>
            </div>
            <div class="queue-foot">
              <div class="queue-progress" :style="{ '--progress': `${bucket.concurrencyUsage * 100}%` }">
                <div class="progress-meta">
                  <span>执行 {{ bucket.inFlight }}</span>
                  <span>并发上限 {{ bucket.concurrency }}</span>
                </div>
                <div class="progress-track">
                  <span class="progress-fill" />
                </div>
              </div>
                    </div>
          </div>
        </div>
      </div>

      <div class="main-stack">
        <div class="panel sessions">
          <div class="panel-title">
            <span>运行中会话</span>
            <span class="note">{{ activeSessionCount }} 个活跃</span>
          </div>
          <div ref="sessionListRef" class="session-list">
            <div v-for="session in activeSessionPreview" :key="session.id" class="session-card">
              <div class="session-head">
                <span class="session-title">{{ session.title }}</span>
                <span class="session-tag">运行中</span>
              </div>
              <div class="session-meta">
                <span>开始 {{ session.startedAtLabel }}</span>
                <span>时长 {{ session.durationLabel }}</span>
              </div>
            </div>
            <div v-if="activeSessionPreview.length === 0" class="empty">暂无运行中的会话</div>
          </div>
          <div v-if="activeSessionOverflow > 0" class="more">+{{ activeSessionOverflow }} 个会话持续运行</div>
        </div>

        <div class="panel events">
          <div class="panel-title">
            <span>事件链路日志</span>
            <span class="note">共 {{ eventLogCount }} 条</span>
          </div>
          <div ref="eventListRef" class="event-list">
            <div v-for="event in eventLog" :key="event.id" class="event-item" :class="event.level">
              <span class="event-dot" />
              <span class="event-text">{{ event.message }}</span>
              <span class="event-time">{{ formatTime(event.at) }}</span>
            </div>
            <div v-if="eventLog.length === 0" class="empty">等待系统事件</div>
          </div>
        </div>

        <div class="panel task-log">
          <div class="panel-title">
            <span>任务日志</span>
            <span class="note">最近 {{ taskLogCount }} 条</span>
          </div>
          <div class="task-log-table">
            <div class="task-log-row header">
              <span class="cell type">任务类型</span>
              <span class="cell stage">阶段</span>
              <span class="cell id">任务 ID</span>
              <span class="cell">等待</span>
              <span class="cell">运行</span>
              <span class="cell">完成</span>
            </div>
            <div ref="taskLogBodyRef" class="task-log-body">
              <div v-for="task in taskLog" :key="`${task.id}-${task.finishedAt}`" class="task-log-row">
                <span class="cell type">
                  <span class="task-type">{{ task.label }}</span>
                  <span class="task-bucket">{{ task.bucket }}</span>
                </span>
                <span class="cell stage">
                  <span class="task-stage" :class="`stage-${task.stage || 'completed'}`">{{ formatTaskStage(task.stage) }}</span>
                </span>
                <span class="cell id">{{ task.id }}</span>
                <span class="cell">{{ formatDuration(task.waitMs) }}</span>
                <span class="cell">{{ formatDuration(task.durationMs) }}</span>
                <span class="cell">{{ formatTime(task.finishedAt) }}</span>
              </div>
              <div v-if="taskLog.length === 0" class="empty">暂无任务记录</div>
            </div>
          </div>
        </div>
      </div>

      <div class="side-stack">
        <div class="panel system">
          <div class="panel-title">
            <span>系统参数</span>
            <span class="note">{{ systemSourceLabel }}</span>
          </div>
          <div class="system-section">
            <div class="section-title">限流矩阵</div>
            <div class="system-table" :style="{ '--cols-rest': systemMatrixColCount }">
              <div class="system-row header">
                <span class="cell metric">指标</span>
                <span v-for="head in systemMatrixHeads" :key="head" class="cell">{{ head }}</span>
              </div>
              <div v-for="row in systemMatrixRows" :key="row.label" class="system-row">
                <span class="cell metric">{{ row.label }}</span>
                <span v-for="item in row.values" :key="item.key" class="cell">{{ item.value }}</span>
              </div>
            </div>
          </div>
          <div class="system-section">
            <div class="section-title">能力与策略</div>
            <div class="system-grid">
              <div v-for="row in systemRows" :key="row.label" class="system-item">
                <span class="label">{{ row.label }}</span>
                <span class="value">{{ row.value }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="panel pulse">
          <div class="panel-title">
            <span>运行脉冲</span>
            <span class="note">实时状态</span>
          </div>
          <div class="pulse-grid">
            <div class="pulse-item">
              <span class="label">队列压力</span>
              <span class="value">{{ queueHealth.label }}</span>
              <span class="hint">总排队 {{ totalPending }}</span>
            </div>
            <div class="pulse-item">
              <span class="label">调度频率</span>
              <span class="value">{{ formatDuration(bucketConfig.global.minIntervalMs) }}</span>
              <span class="hint">全局最小间隔</span>
            </div>
            <div class="pulse-item">
              <span class="label">语言翻译</span>
              <span class="value">{{ translationEnabled ? '开启' : '关闭' }}</span>
              <span class="hint">{{ backendConfig.transcriptSegmentTranslationLanguage || '--' }}</span>
            </div>
            <div class="pulse-item">
              <span class="label">分析语言</span>
              <span class="value">{{ backendConfig.transcriptAnalysisLanguageEnabled ? '开启' : '关闭' }}</span>
              <span class="hint">{{ backendConfig.transcriptAnalysisLanguage || '--' }}</span>
            </div>
          </div>
          <div class="pulse-foot">
            <span>实例 {{ queueStats?.instanceId || '--' }}</span>
            <span>最近同步 {{ lastRefreshLabel }}</span>
          </div>
        </div>
      </div>
    </section>
    <SettingsDrawer v-model="settingsDrawerVisible" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useBackendConfig } from '@/composables/useBackendConfig'
import {
  appConfigSecurityApi,
  type GlmQueueStats,
  type Session,
} from '@/services/api'
import { getApiBaseUrl } from '@/services/http'
import { clearSettingsPassword, getSettingsPassword, setSettingsPassword } from '@/services/settingsSecurity'
import SettingsDrawer from '@/components/SettingsDrawer.vue'

const { backendConfig, refreshBackendConfig } = useBackendConfig()
const queueStats = ref<GlmQueueStats | null>(null)
const sessions = ref<Session[]>([])
const lastRefreshAt = ref(0)
const nowMs = ref(Date.now())
const configReady = ref(false)
const systemSourceLabel = ref('系统配置未同步')
const systemAuthHint = ref('')
const settingsDrawerVisible = ref(false)
const openingSettingsDrawer = ref(false)
const eventLog = ref<Array<{ id: number; level: 'info' | 'warn'; message: string; at: number }>>([])
const taskLog = ref<OpsTaskLogEntry[]>([])
const eventListRef = ref<HTMLElement | null>(null)
const taskLogBodyRef = ref<HTMLElement | null>(null)
const sessionListRef = ref<HTMLElement | null>(null)
let eventId = 1
let queueSnapshot: GlmQueueStats | null = null

const translationEnabled = computed(
  () => backendConfig.value.transcriptSegmentTranslationEnabled === true
)

const bucketMeta = [
  { key: 'global', label: '全局', color: '#2f4858' },
  { key: 'asr', label: 'ASR', color: '#e85d37' },
  { key: 'segmentation', label: '拆分', color: '#1f7a8c' },
  { key: 'translation', label: '翻译', color: '#7c9f5f' },
  { key: 'analysis', label: '分析', color: '#e0a458' },
] as const
const bucketLabelMap = bucketMeta.reduce((acc, bucket) => {
  acc[bucket.key] = bucket.label
  return acc
}, {} as Record<string, string>)

const formatDuration = (value: number | null | undefined) => {
  if (!Number.isFinite(value)) return '--'
  const safe = Math.max(0, Number(value))
  if (safe >= 1000) return `${(safe / 1000).toFixed(1)}s`
  return `${Math.round(safe)}ms`
}

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

const formatTaskStage = (stage?: OpsTaskLogEntry['stage']) => {
  if (stage === 'stream_established') return '流建立'
  if (stage === 'stream_completed') return '流完成'
  return '完成'
}

const formatSessionDuration = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '--'
  const totalSeconds = Math.floor(value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m`
  return `${minutes}m${String(seconds).padStart(2, '0')}s`
}

const clampCooldownMs = (cooldown: number, max: number) =>
  Math.max(0, Math.min(Math.max(0, max), Math.max(0, cooldown)))

const bucketConfig = computed(() => ({
  global: {
    concurrency: backendConfig.value.glmGlobalConcurrency,
    minIntervalMs: backendConfig.value.glmGlobalMinIntervalMs,
    cooldownMs: clampCooldownMs(
      backendConfig.value.glmGlobalRateLimitCooldownMs,
      backendConfig.value.glmGlobalRateLimitMaxMs
    ),
  },
  asr: {
    concurrency: backendConfig.value.glmAsrConcurrency,
    minIntervalMs: backendConfig.value.glmAsrMinIntervalMs,
    cooldownMs: clampCooldownMs(
      backendConfig.value.glmAsrRateLimitCooldownMs,
      backendConfig.value.glmAsrRateLimitMaxMs
    ),
  },
  segmentation: {
    concurrency: backendConfig.value.glmTranscriptEventSegmentConcurrency,
    minIntervalMs: backendConfig.value.glmTranscriptEventSegmentMinIntervalMs,
    cooldownMs: clampCooldownMs(
      backendConfig.value.glmTranscriptEventSegmentRateLimitCooldownMs,
      backendConfig.value.glmTranscriptEventSegmentRateLimitMaxMs
    ),
  },
  translation: {
    concurrency: translationEnabled.value
      ? backendConfig.value.glmTranscriptEventSegmentTranslationConcurrency
      : 0,
    minIntervalMs: backendConfig.value.glmTranscriptEventSegmentTranslationMinIntervalMs,
    cooldownMs: clampCooldownMs(
      backendConfig.value.glmTranscriptEventSegmentTranslationRateLimitCooldownMs,
      backendConfig.value.glmTranscriptEventSegmentTranslationRateLimitMaxMs
    ),
  },
  analysis: {
    concurrency: backendConfig.value.glmTranscriptAnalysisConcurrency,
    minIntervalMs: backendConfig.value.glmTranscriptAnalysisMinIntervalMs,
    cooldownMs: clampCooldownMs(
      backendConfig.value.glmTranscriptAnalysisRateLimitCooldownMs,
      backendConfig.value.glmTranscriptAnalysisRateLimitMaxMs
    ),
  },
}))

const cooldownRemainingMs = (bucketKey: keyof typeof bucketConfig.value) => {
  const lastRateLimitAt = queueStats.value?.buckets?.[bucketKey]?.lastRateLimitAt
  if (!Number.isFinite(lastRateLimitAt) || !lastRateLimitAt) return 0
  const cooldownMs = bucketConfig.value[bucketKey]?.cooldownMs ?? 0
  return Math.max(0, Math.floor(lastRateLimitAt + cooldownMs - nowMs.value))
}

const globalCooldownRemainingMs = computed(() => cooldownRemainingMs('global'))

const totalPending = computed(() => queueStats.value?.totalPending ?? 0)
const totalInFlight = computed(() => queueStats.value?.buckets?.global?.inFlight ?? 0)

const queueHealth = computed(() => {
  if (totalPending.value === 0) return { label: '顺畅', level: 'ok' }
  if (totalPending.value < 5) return { label: '轻度排队', level: 'warn' }
  if (totalPending.value < 15) return { label: '明显排队', level: 'warn' }
  return { label: '拥堵', level: 'danger' }
})

const queueCards = computed(() =>
  bucketMeta
    .filter((bucket) => bucket.key !== 'translation' || translationEnabled.value)
    .map((bucket) => {
      const stats = queueStats.value?.buckets?.[bucket.key]
      const queue = stats?.queue ?? 0
      const inFlight = stats?.inFlight ?? 0
      const delayP50 = stats?.queueDelayP50Ms ?? null
      const durationP95 = stats?.durationP95Ms ?? null
      const concurrency = bucketConfig.value[bucket.key as keyof typeof bucketConfig.value]?.concurrency ?? 0
      const cooldownLeft = cooldownRemainingMs(bucket.key as keyof typeof bucketConfig.value)
      const concurrencyUsage = concurrency > 0 ? Math.min(1, inFlight / concurrency) : 0
      const status = cooldownLeft > 0 ? 'cooldown' : queue > 0 ? 'busy' : 'idle'
      const statusLabel = cooldownLeft > 0 ? '冷却中' : queue > 0 ? '排队中' : '空闲'
      return {
        ...bucket,
        queue,
        inFlight,
        queueDelayP50Ms: delayP50,
        durationP95Ms: durationP95,
        concurrency,
        concurrencyUsage,
        cooldownRemainingMs: cooldownLeft,
        status,
        statusLabel,
      }
    })
)


const activeSessions = computed(() =>
  sessions.value
    .filter((session) => session.isActive && !session.isArchived)
    .sort((a, b) => {
      const aTime = Date.parse(a.startedAt) || 0
      const bTime = Date.parse(b.startedAt) || 0
      return bTime - aTime
    })
)

const activeSessionCount = computed(() => activeSessions.value.length)
const activeSessionPreviewLimit = 6
const activeSessionPreview = computed(() =>
  activeSessions.value.slice(0, activeSessionPreviewLimit).map((session) => {
    const startedAt = Date.parse(session.startedAt) || 0
    const endedAt = session.endedAt ? Date.parse(session.endedAt) : 0
    const duration = endedAt > 0 ? endedAt - startedAt : nowMs.value - startedAt
    return {
      id: session.id,
      title: session.title?.trim() || `会话 ${session.id.slice(0, 4)}`,
      startedAtLabel: formatTime(startedAt),
      durationLabel: formatSessionDuration(duration),
    }
  })
)
const activeSessionOverflow = computed(() =>
  Math.max(0, activeSessions.value.length - activeSessionPreviewLimit)
)

const systemMatrixHeads = computed(() => {
  const heads = ['全局', 'ASR', '拆分']
  if (translationEnabled.value) heads.push('翻译')
  heads.push('分析')
  return heads
})

const systemMatrixColCount = computed(() => systemMatrixHeads.value.length)

const formatMs = (value: number) => `${value}ms`

const systemMatrixRows = computed(() => {
  const config = backendConfig.value
  const buildRow = (label: string, values: Array<{ key: string; value: string | number }>) => ({
    label,
    values,
  })
  const translateValue = (value: number, formatter?: (value: number) => string) =>
    translationEnabled.value ? (formatter ? formatter(value) : value) : '关闭'
  const rows = [
    buildRow('并发', [
      { key: 'global', value: config.glmGlobalConcurrency },
      { key: 'asr', value: config.glmAsrConcurrency },
      { key: 'segment', value: config.glmTranscriptEventSegmentConcurrency },
      { key: 'translate', value: translateValue(config.glmTranscriptEventSegmentTranslationConcurrency) },
      { key: 'analysis', value: config.glmTranscriptAnalysisConcurrency },
    ]),
    buildRow('最小间隔', [
      { key: 'global', value: formatMs(config.glmGlobalMinIntervalMs) },
      { key: 'asr', value: formatMs(config.glmAsrMinIntervalMs) },
      { key: 'segment', value: formatMs(config.glmTranscriptEventSegmentMinIntervalMs) },
      { key: 'translate', value: translateValue(config.glmTranscriptEventSegmentTranslationMinIntervalMs, formatMs) },
      { key: 'analysis', value: formatMs(config.glmTranscriptAnalysisMinIntervalMs) },
    ]),
    buildRow('冷却时间', [
      { key: 'global', value: formatMs(config.glmGlobalRateLimitCooldownMs) },
      { key: 'asr', value: formatMs(config.glmAsrRateLimitCooldownMs) },
      { key: 'segment', value: formatMs(config.glmTranscriptEventSegmentRateLimitCooldownMs) },
      { key: 'translate', value: translateValue(config.glmTranscriptEventSegmentTranslationRateLimitCooldownMs, formatMs) },
      { key: 'analysis', value: formatMs(config.glmTranscriptAnalysisRateLimitCooldownMs) },
    ]),
  ]
  return rows.map((row) => ({
    label: row.label,
    values: row.values.filter((item) => item.key !== 'translate' || translationEnabled.value),
  }))
})

const systemRows = computed(() => {
  const config = backendConfig.value
  const rows = [
    { label: '翻译开关', value: translationEnabled.value ? '开启' : '关闭' },
    { label: '翻译语言', value: config.transcriptSegmentTranslationLanguage || '--' },
    { label: '翻译模型', value: config.glmTranscriptSegmentTranslationModel || '--' },
    { label: '分析语言开关', value: config.transcriptAnalysisLanguageEnabled ? '开启' : '关闭' },
    { label: '分析语言', value: config.transcriptAnalysisLanguage || '--' },
    { label: '摘要模型', value: config.glmTranscriptSummaryModel || '--' },
    { label: '摘要最大 tokens', value: config.glmTranscriptSummaryMaxTokens },
    { label: '摘要思考模式', value: config.glmTranscriptSummaryThinking ? '开启' : '关闭' },
    { label: '针对性思考模式', value: config.glmTranscriptSegmentAnalysisThinking ? '开启' : '关闭' },
    { label: '拆分并发上限', value: config.transcriptEventsSegmentMaxInFlight },
    { label: '拆分最大会话', value: config.transcriptEventsSegmentMaxPendingSessions },
    { label: '拆分过期阈值', value: formatMs(config.transcriptEventsSegmentMaxStalenessMs) },
    { label: '自动拆分间隔', value: formatMs(config.transcriptAutoSplitGapMs) },
  ]
  return rows.filter((row) => row.value !== undefined && row.value !== null)
})

const lastRefreshLabel = computed(() => formatTime(lastRefreshAt.value))
const eventLogCount = computed(() => eventLog.value.length)
const taskLogCount = computed(() => taskLog.value.length)

type OpsTaskLogEntry = {
  id: string
  bucket: string
  label: string
  waitMs: number
  durationMs: number
  startedAt: number
  finishedAt: number
  status: 'ok' | 'error'
  stage?: 'completed' | 'stream_established' | 'stream_completed'
}

type OpsStreamPayload = {
  queueStats?: GlmQueueStats | null
  sessions?: Session[]
  taskLog?: OpsTaskLogEntry[]
  timestamp?: number
  error?: string
}

type OpsStreamEnvelope = {
  code?: number
  message?: string
  data?: OpsStreamPayload
}

const recordEvent = (message: string, level: 'info' | 'warn' = 'info') => {
  eventLog.value.unshift({ id: eventId++, level, message, at: nowMs.value })
}

const analyzeQueueDelta = (next: GlmQueueStats, prev: GlmQueueStats | null) => {
  if (!prev) return
  const activeKeys = bucketMeta
    .filter((bucket) => bucket.key !== 'translation' || translationEnabled.value)
    .map((bucket) => bucket.key)
  for (const key of activeKeys) {
    const nextBucket = next.buckets?.[key]
    const prevBucket = prev.buckets?.[key]
    if (!nextBucket || !prevBucket) continue
    const label = bucketLabelMap[key] ?? key.toUpperCase()
    if ((nextBucket.rateLimitCount ?? 0) > (prevBucket.rateLimitCount ?? 0)) {
      recordEvent(`${label} 触发限流，进入冷却`, 'warn')
    }
    if ((prevBucket.queue ?? 0) === 0 && (nextBucket.queue ?? 0) > 0) {
      recordEvent(`${label} 队列开始累积`, 'info')
    }
    if ((prevBucket.queue ?? 0) > 0 && (nextBucket.queue ?? 0) === 0) {
      recordEvent(`${label} 队列清空`, 'info')
    }
    const concurrency = bucketConfig.value[key as keyof typeof bucketConfig.value]?.concurrency ?? 0
    if ((prevBucket.inFlight ?? 0) < concurrency && (nextBucket.inFlight ?? 0) >= concurrency) {
      recordEvent(`${label} 达到并发上限`, 'warn')
    }
  }
}

const buildOpsStreamUrl = () => {
  const base = getApiBaseUrl() || '/api'
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base
  return `${normalized}/ops/stream`
}

const applyOpsPayload = (payload: OpsStreamPayload) => {
  if (payload.queueStats) {
    analyzeQueueDelta(payload.queueStats, queueSnapshot)
    queueStats.value = payload.queueStats
    queueSnapshot = payload.queueStats
  } else if (payload.queueStats === null) {
    queueStats.value = null
    queueSnapshot = null
  }
  if (Array.isArray(payload.sessions)) {
    sessions.value = payload.sessions
  }
  if (Array.isArray(payload.taskLog)) {
    taskLog.value = payload.taskLog
  }
  const ts = payload.timestamp ?? Date.now()
  lastRefreshAt.value = ts
  nowMs.value = ts
}

const normalizeOpsPayload = (raw: unknown): OpsStreamPayload | null => {
  if (!raw || typeof raw !== 'object') return null
  const envelope = raw as OpsStreamEnvelope
  if (envelope.data && typeof envelope.data === 'object') {
    return envelope.data
  }
  return raw as OpsStreamPayload
}

const handleOpsStreamMessage = (event: MessageEvent<string>) => {
  if (!event?.data) return
  try {
    const parsed = JSON.parse(event.data) as unknown
    const payload = normalizeOpsPayload(parsed)
    if (!payload) return
    if (payload.error) {
      recordEvent(payload.error, 'warn')
      return
    }
    applyOpsPayload(payload)
  } catch {
    recordEvent('运行流数据解析失败', 'warn')
  }
}

const syncSystemSettings = async () => {
  configReady.value = false
  systemSourceLabel.value = '系统配置未同步'
  systemAuthHint.value = ''
  const refreshed = await refreshBackendConfig()
  if (refreshed) {
    configReady.value = true
    systemSourceLabel.value = '已同步后端配置'
    return
  }
  try {
    const status = await appConfigSecurityApi.getStatus()
    if (status?.data?.enabled) {
      systemSourceLabel.value = '系统配置未授权'
      systemAuthHint.value = '请完成系统设置密码验证'
      return
    }
  } catch {
    // ignore
  }
  systemSourceLabel.value = '系统配置不可用'
}

const verifySettingsPassword = async (password: string): Promise<boolean> => {
  try {
    await appConfigSecurityApi.verify(password)
    return true
  } catch {
    return false
  }
}

const openSettingsDrawer = async (): Promise<void> => {
  if (openingSettingsDrawer.value) return
  openingSettingsDrawer.value = true
  try {
    const status = await appConfigSecurityApi.getStatus()
    const enabled = status?.data?.enabled === true
    if (!enabled) {
      settingsDrawerVisible.value = true
      return
    }
    const cachedPassword = getSettingsPassword().trim()
    if (cachedPassword) {
      const verified = await verifySettingsPassword(cachedPassword)
      if (verified) {
        settingsDrawerVisible.value = true
        return
      }
      clearSettingsPassword()
    }
    try {
      const { value } = await ElMessageBox.prompt('请输入系统设置密码', '验证', {
        inputType: 'password',
        confirmButtonText: '确认',
        cancelButtonText: '取消',
      })
      const password = String(value ?? '').trim()
      if (!password) {
        ElMessage.warning('密码不能为空')
        return
      }
      const verified = await verifySettingsPassword(password)
      if (!verified) {
        ElMessage.error('密码错误')
        return
      }
      setSettingsPassword(password)
      settingsDrawerVisible.value = true
    } catch {
      // 用户取消
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '获取系统设置状态失败')
  } finally {
    openingSettingsDrawer.value = false
  }
}

let clockTimer: number | null = null
let opsEventSource: EventSource | null = null
const clockIntervalMs = 1000

const startClock = () => {
  if (clockTimer) return
  clockTimer = window.setInterval(() => {
    nowMs.value = Date.now()
  }, clockIntervalMs)
}

const stopClock = () => {
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
}

const connectOpsStream = () => {
  if (opsEventSource) return
  const url = buildOpsStreamUrl()
  opsEventSource = new EventSource(url)
  opsEventSource.onmessage = handleOpsStreamMessage
  opsEventSource.onerror = () => {
    recordEvent('运行流连接中断，等待自动重连', 'warn')
  }
}

const disconnectOpsStream = () => {
  if (!opsEventSource) return
  opsEventSource.close()
  opsEventSource = null
}

watch(
  () => settingsDrawerVisible.value,
  (visible, prev) => {
    if (!visible && prev) {
      void syncSystemSettings()
    }
  }
)

const scrollToTop = (el: HTMLElement | null) => {
  if (!el) return
  el.scrollTop = 0
}

watch(
  () => eventLog.value.length,
  async () => {
    await nextTick()
    scrollToTop(eventListRef.value)
  }
)

watch(
  () => taskLog.value.length,
  async () => {
    await nextTick()
    scrollToTop(taskLogBodyRef.value)
  }
)

watch(
  () => activeSessionPreview.value.length,
  async () => {
    await nextTick()
    scrollToTop(sessionListRef.value)
  }
)

onMounted(() => {
  void syncSystemSettings()
  startClock()
  connectOpsStream()
})

onBeforeUnmount(() => {
  disconnectOpsStream()
  stopClock()
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

.ops-screen {
  --ink: #172327;
  --muted: #4b5b60;
  --panel: #fff9f0;
  --panel-strong: #f2e9dc;
  --outline: rgba(23, 35, 39, 0.14);
  --shadow: 0 18px 50px rgba(18, 28, 33, 0.12);
  --radius: 18px;
  min-height: 100vh;
  box-sizing: border-box;
  padding: 24px 26px;
  color: var(--ink);
  font-family: 'IBM Plex Sans', 'Noto Sans SC', 'PingFang SC', sans-serif;
  background: radial-gradient(circle at top, rgba(255, 246, 231, 0.95), transparent 58%),
    radial-gradient(circle at 90% 10%, rgba(213, 231, 219, 0.85), transparent 50%),
    linear-gradient(165deg, #f8f1e6, #f2f7f3 52%, #fff7e8);
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
  align-content: start;
}

.ops-screen::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(23, 35, 39, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(23, 35, 39, 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  opacity: 0.4;
  pointer-events: none;
}

/* ========== 紧凑 Header 样式 ========== */
.ops-hero-compact {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 4px;
}

.hero-compact-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.eyebrow {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.25em;
  color: var(--muted);
  font-weight: 500;
}

.hero-compact-quick {
  display: flex;
  gap: 8px;
  align-items: center;
}

.quick-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: rgba(251, 247, 240, 0.9);
  border: 1px solid var(--outline);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  color: var(--ink);
  cursor: default;
  transition: all 0.2s ease;
}

.quick-badge.clickable {
  cursor: pointer;
}

.quick-badge.clickable:hover {
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 4px 12px rgba(18, 28, 33, 0.1);
  transform: translateY(-1px);
}

.quick-badge.clickable:active {
  transform: translateY(0);
}

.quick-badge-icon {
  font-size: 13px;
}

.quick-badge-label {
  white-space: nowrap;
}

.hero-compact-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.hero-compact-title h1 {
  font-family: 'Fraunces', 'Noto Serif SC', serif;
  font-size: clamp(18px, 2.2vw, 26px);
  margin: 0;
  line-height: 1.2;
}

.hero-compact-title .divider {
  color: rgba(23, 35, 39, 0.2);
  font-weight: 300;
}

.hero-compact-title .sub {
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
  margin: 0;
}

.hero-compact-metrics {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.metric-card {
  background: rgba(251, 247, 240, 0.92);
  border: 1px solid var(--outline);
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  box-shadow: var(--shadow);
  position: relative;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.metric-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
}

.metric-card.metric-ok::before {
  background: rgba(124, 159, 95, 0.7);
}

.metric-card.metric-warn::before {
  background: rgba(224, 164, 88, 0.7);
}

.metric-card.metric-danger::before {
  background: rgba(232, 93, 55, 0.7);
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.metric-label {
  font-size: 11px;
  color: var(--muted);
  font-weight: 500;
}

.metric-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid var(--outline);
}

.metric-badge.ok {
  background: rgba(124, 159, 95, 0.15);
  color: #4b6b38;
}

.metric-badge.warn {
  background: rgba(224, 164, 88, 0.15);
  color: #a16512;
}

.metric-badge.danger {
  background: rgba(232, 93, 55, 0.15);
  color: #a23f21;
}

.metric-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.2;
  flex: 1;
}

.metric-hint {
  font-size: 10px;
  color: var(--muted);
  flex-shrink: 0;
  opacity: 0.8;
}

.ops-grid {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 2.1fr) minmax(0, 1fr);
  grid-template-areas:
    'queues queues'
    'main side';
  grid-template-rows: auto minmax(0, 1fr);
  align-items: start;
  min-height: 0;
}

.main-stack {
  grid-area: main;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-areas:
    'sessions events'
    'tasklog tasklog';
  min-height: 0;
}

.panel {
  background: rgba(251, 247, 240, 0.88);
  border: 1px solid var(--outline);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow);
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.queues {
  grid-area: queues;
}

.sessions {
  grid-area: sessions;
}

.events {
  grid-area: events;
}

.task-log {
  grid-area: tasklog;
}

.side-stack {
  grid-area: side;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.side-stack .panel {
  min-height: 0;
}

.panel-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.panel-title .note {
  font-size: 12px;
  color: var(--muted);
}

.queue-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.queue-card {
  border-radius: 14px;
  padding: 12px;
  background: #fff;
  border: 1px solid var(--outline);
  display: grid;
  gap: 10px;
}

.queue-head {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
}

.queue-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.queue-state {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--outline);
}

.queue-state.cooldown {
  background: rgba(232, 93, 55, 0.1);
  color: #9b3b1f;
}

.queue-state.busy {
  background: rgba(31, 122, 140, 0.12);
  color: #13535f;
}

.queue-state.idle {
  background: rgba(124, 159, 95, 0.12);
  color: #4b6b38;
}

.queue-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.metric-label {
  font-size: 10px;
  color: var(--muted);
  display: block;
}

.metric-value {
  font-size: 14px;
  font-weight: 600;
}

.queue-foot {
  display: grid;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
}

.queue-progress {
  display: grid;
  gap: 4px;
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  color: var(--muted);
}

.progress-track {
  position: relative;
  height: 6px;
  border-radius: 999px;
  background: rgba(23, 35, 39, 0.12);
  overflow: hidden;
}

.progress-fill {
  display: block;
  height: 100%;
  width: var(--progress, 0%);
  background: var(--accent);
  transition: width 0.2s ease;
  opacity: 0.85;
}

.queue-cooldown {
  font-size: 10px;
}

.system-section {
  display: grid;
  gap: 8px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.system-table {
  display: grid;
  gap: 6px;
  border: 1px solid var(--outline);
  border-radius: 12px;
  padding: 8px;
  background: #fff;
}

.system-row {
  display: grid;
  grid-template-columns: 1.2fr repeat(var(--cols-rest, 4), minmax(0, 1fr));
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
}

.system-row.header {
  font-weight: 600;
  color: var(--ink);
}

.system-row .cell {
  text-align: center;
}

.system-row .cell.metric {
  text-align: left;
}

.system-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.system-item {
  border-radius: 10px;
  padding: 6px 8px;
  border: 1px solid var(--outline);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
}

.system-item .value {
  font-weight: 600;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.session-list {
  display: grid;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.session-card {
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid var(--outline);
  background: #fff;
  display: grid;
  gap: 6px;
}

.session-head {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
}

.session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.session-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(31, 122, 140, 0.12);
  color: #13535f;
}

.session-meta {
  font-size: 11px;
  color: var(--muted);
  display: flex;
  justify-content: space-between;
}

.event-list {
  display: grid;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.event-item {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.event-item.warn {
  color: #9b3b1f;
}

.event-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1f7a8c;
}

.event-item.warn .event-dot {
  background: #e85d37;
}

.event-time {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 11px;
  color: var(--muted);
}

.task-log-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
}

.task-log-row {
  display: grid;
  grid-template-columns: 1.2fr 0.7fr 1.6fr 0.7fr 0.7fr 0.8fr;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--muted);
}

.task-log-row.header {
  font-weight: 600;
  color: var(--ink);
}

.task-log-row .cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-log-row .cell.type {
  display: flex;
  align-items: center;
  gap: 6px;
}

.task-log-row .cell.stage {
  display: flex;
  align-items: center;
}

.task-log-row .cell.id {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 11px;
}

.task-bucket {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--outline);
  background: var(--panel-strong);
  color: var(--ink);
}

.task-stage {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--outline);
  background: rgba(31, 122, 140, 0.12);
  color: #13535f;
}

.task-stage.stage-stream_completed {
  background: rgba(124, 159, 95, 0.15);
  color: #4b6b38;
}

.task-stage.stage-completed {
  background: rgba(23, 35, 39, 0.08);
  color: var(--ink);
}

.task-log-body {
  display: grid;
  gap: 6px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.pulse-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.pulse-item {
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px dashed var(--outline);
  background: var(--panel-strong);
  display: grid;
  gap: 6px;
  font-size: 12px;
}

.pulse-item .value {
  font-size: 16px;
  font-weight: 600;
}

.pulse-item .hint {
  font-size: 11px;
  color: var(--muted);
}

.pulse-foot {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
}

.empty,
.more {
  font-size: 12px;
  color: var(--muted);
}

/* ========== 响应式设计 ========== */
@media (max-width: 1400px) {
  .hero-compact-metrics {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1201px) {
  .ops-screen {
    height: 100vh;
    overflow: hidden;
  }

  .ops-grid,
  .main-stack,
  .side-stack {
    height: 100%;
  }

  .main-stack {
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }

  .side-stack .panel {
    flex: 1 1 0;
    min-height: 0;
  }

  .sessions,
  .events,
  .task-log {
    height: 100%;
  }
}

@media (max-width: 1200px) {
  .ops-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'queues'
      'main'
      'side';
  }

  .main-stack {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'sessions'
      'events'
      'tasklog';
  }

  .hero-compact-metrics {
    grid-template-columns: repeat(3, 1fr);
  }

  .hero-compact-title {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .hero-compact-title .divider {
    display: none;
  }
}

@media (max-width: 900px) {
  .ops-screen {
    min-height: 100vh;
  }

  .side-stack {
    gap: 12px;
  }

  .ops-hero-compact {
    gap: 8px;
  }

  .hero-compact-top {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .hero-compact-quick {
    width: 100%;
    justify-content: flex-start;
  }

  .hero-compact-metrics {
    grid-template-columns: repeat(2, 1fr);
  }

  .metric-card {
    padding: 10px 12px;
  }
}

@media (max-width: 600px) {
  .hero-compact-metrics {
    grid-template-columns: 1fr;
  }
}

.fontsize-30 {
  font-size: 30px;
}
</style>
