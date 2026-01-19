<template>
  <MainLayout :style="{ '--app-bottom-inset': appBottomInsetStyle }">
    <template #header>
      <AppHeader
        title="AI会议助手"
        :showBackButton="true"
        :status="sessionInfo?.isActive ? 'active' : 'ended'"
        @back="router.push('/')"
      />

      <div class="header-right">
        <el-tooltip :content="recordingTag.text" placement="bottom">
          <span
            class="recording-indicator header-icon-button"
            :class="`is-${recordingIndicatorStatus}`"
            role="status"
            :aria-label="recordingTag.text"
          >
            <el-icon :class="{ 'is-spinning': recordingIndicatorStatus === 'connecting' }">
              <component :is="recordingIndicatorIcon" />
            </el-icon>
          </span>
        </el-tooltip>

        <el-tooltip :content="aiQueueTooltip" placement="bottom">
          <el-tag size="small" class="queue-tag" :type="aiQueueTagType">
            AI 队列: {{ aiQueueDisplay }}
          </el-tag>
        </el-tooltip>

        <el-tag v-if="wsReconnectTag" :type="wsReconnectTag.type" size="small" class="ws-tag">
          {{ wsReconnectTag.text }}
        </el-tag>
        <el-button
          v-if="wsRetryVisible"
          size="small"
          type="warning"
          plain
          class="ws-retry-button"
          :icon="Refresh"
          @click="retryRecordingConnection"
        >
          重试连接
        </el-button>

        <div class="header-icon-group">
          <el-tooltip content="设置" placement="bottom">
            <el-button
              size="small"
              circle
              class="header-icon-button ghost-icon"
              @click="openSettingsDrawer"
            >
              <el-icon><Setting /></el-icon>
              <span class="sr-only">设置</span>
            </el-button>
          </el-tooltip>

          <el-tooltip content="调试" placement="bottom">
            <el-button
              size="small"
              circle
              class="header-icon-button ghost-icon"
              :disabled="!sessionId"
              @click="debugDrawerVisible = true"
            >
              <el-icon><Monitor /></el-icon>
              <span class="sr-only">调试</span>
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </template>

    <div :class="['workspace-grid', { 'realtime-collapsed': realtimeCollapsed }]">
      <!-- 上部：原文流（GLM 语音识别） -->
      <section :class="['realtime-transcript-bar', { collapsed: realtimeCollapsed }]" class="app-surface">
        <div class="realtime-header">
          <div class="realtime-title">
            <h3>语音转写</h3>
          <el-button
            size="small"
            class="ghost-button"
            :aria-label="realtimeCollapsed ? '展开语音转写' : '折叠语音转写'"
            @click="realtimeCollapsed = !realtimeCollapsed"
          >
            <el-icon>
              <component :is="realtimeCollapsed ? ArrowRight : ArrowLeft" />
            </el-icon>
          </el-button>
          </div>
  	        <div class="realtime-status">
  	           
  	          <el-tag type="info" size="small">事件数: {{ transcriptStreamStore.events.length }}</el-tag>
  	          
  	          <el-tag v-if="segmentationStageText" :type="segmentationStageTagType" size="small">
  	            LLM: {{ segmentationStageText }}
  	          </el-tag>
  	        </div>
  	      </div>
  	      <div v-show="!realtimeCollapsed" class="realtime-content">
          <div v-if="transcriptStreamStore.events.length === 0" class="realtime-placeholder">
            暂无实时转写内容
          </div>
          <div v-else ref="realtimeScrollRef" class="realtime-stream-scroll" @scroll="handleRealtimeScroll">
            <div class="realtime-stream" role="article" aria-label="原文流内容">
              <span
                v-for="(event, index) in transcriptStreamStore.events"
                :key="event.eventIndex"
                :data-event-index="event.eventIndex"
                :class="[
                  'realtime-event-item',
                  event.isFinal ? 'is-final' : 'is-draft',
                  focusedEventIndex === event.eventIndex ? 'is-focused' : '',
                  isEventFullyHighlighted(event.eventIndex, event.content) ? 'is-highlighted' : '',
                ]"
                :style="{ '--stagger': index }"
                :title="`事件#${event.eventIndex}`"
              >
                <span class="event-inline-meta">
                  <span class="event-index">#{{ event.eventIndex }}</span>
                  <span
                    v-if="event.isFinal && getEventDurationText(event.eventIndex)"
                    class="event-duration"
                  >
                    {{ getEventDurationText(event.eventIndex) }}
                  </span>
                </span>
                <span class="event-text">
                  <template v-if="getEventHighlightParts(event.eventIndex, event.content)?.mode === 'partial'">
                    <span>{{ getEventHighlightParts(event.eventIndex, event.content)?.before }}</span>
                    <span class="event-text-highlight">
                      {{ getEventHighlightParts(event.eventIndex, event.content)?.highlight }}
                    </span>
                    <span>{{ getEventHighlightParts(event.eventIndex, event.content)?.after }}</span>
                  </template>
                  <template v-else>
                    {{ event.content }}
                  </template>
                </span>
                <span class="event-sep"> </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 下部：左右分栏 -->
      <div class="content-area" :class="{ narrow: isNarrow }">
      <!-- 下左：GLM 拆分后的独立发言 -->
	      <section class="transcript-panel app-surface">
	      <div class="panel-header">
        <div class="panel-title-row">
          <h2>语句拆分</h2>
          <el-radio-group
            v-model="segmentDisplayMode"
            size="small"
            class="segment-display-toggle"
            :disabled="!transcriptSegmentTranslationAvailable"
            @change="segmentDisplayTouched = true"
          >
            <el-radio-button value="source">原文</el-radio-button>
            <el-radio-button value="translated">翻译</el-radio-button>
          </el-radio-group>
          <el-tag
	            v-if="transcriptEventSegmentationStore.pointerEventIndex != null"
	            :type="transcriptEventSegmentationStore.isInFlight ? 'warning' : 'info'"
	            size="small"
	          >
	            {{ transcriptEventSegmentationStore.isInFlight ? '拆分中' : '拆分进度' }}:
	            #{{ transcriptEventSegmentationStore.pointerEventIndex }}
	            <template v-if="maxAvailableEventIndex != null">
	              /#{{ maxAvailableEventIndex }}
	            </template>
	          </el-tag>
          </div>
	        <div class="panel-actions">
          <el-button
            v-if="showRebuildButton"
            size="small"
            type="danger"
            plain
            :icon="Refresh"
            :loading="rebuildingTranscriptSegments"
            :disabled="!sessionId || rebuildingTranscriptSegments"
            @click="rebuildTranscriptSegments"
          >
	            重拆
	          </el-button>
	          <el-tooltip
	            :content="transcriptSegmentOrder === 'desc' ? '切换为正序（旧→新）' : '切换为倒序（新→旧）'"
	            placement="bottom"
	          >
            <el-button
              size="small"
              class="segment-order-trigger"
              :icon="transcriptSegmentOrder === 'desc' ? SortDown : SortUp"
              @click="transcriptSegmentOrder = transcriptSegmentOrder === 'desc' ? 'asc' : 'desc'"
            >
              {{ transcriptSegmentOrder === 'desc' ? '倒序' : '正序' }}
            </el-button>
          </el-tooltip>
        </div>
      </div>

	      <div class="transcript-content">
	        <TranscriptEventSegmentsPanel
          :segments="transcriptEventSegmentationStore.segments"
          :order="transcriptSegmentOrder"
          :loading="transcriptEventSegmentationStore.isLoadingSnapshot"
          :progress="transcriptEventSegmentationStore.progress"
          :translation-enabled="transcriptSegmentTranslationAvailable"
          :display-mode="segmentDisplayMode"
          :highlighted-segment-id="analysisMode === 'target' ? targetSegment?.id : null"
          @select-range="focusRealtimeRange"
          @target-analysis="handleTargetAnalysis"
	        />
	      </div>
	    </section>

	    <!-- 通用分析总结面板 -->
	    <section v-show="analysisMode === 'general'" class="analysis-panel app-surface">
	      <div class="panel-header">
	        <div class="panel-title-row">
	          <h2>{{ analysisPanelTitle }}</h2>
	          <el-tag v-if="hasAnalysisContent" type="success" size="small">
	            已分析
	          </el-tag>
	        </div>
	        <div class="panel-actions">
	          <el-button
	            v-if="hasAnalysisContent && !isAnalyzing"
	            size="small"
	            type="danger"
	            plain
	            @click="clearAnalysis"
	          >
	            清空
	          </el-button>
	          <el-button
	            size="small"
	            type="primary"
	            :icon="MagicStick"
	            :loading="isAnalyzing"
	            :disabled="!sessionId || transcriptStreamStore.nextEventIndex === 0"
	            @click="startAnalysis"
	          >
	            {{ isAnalyzing ? '分析中...' : (hasAnalysisContent ? '重新分析' : '开始分析') }}
	          </el-button>
	        </div>
	      </div>

	      <div class="analysis-content" ref="analysisScrollRef">
	        <!-- 空状态占位符 -->
	        <div v-if="!hasAnalysisContent && !isAnalyzing && !analysisError" class="analysis-empty">
	          <div class="empty-icon">
	            <el-icon :size="48"><Document /></el-icon>
	          </div>
	          <p class="empty-text">等待分析</p>
	          <p class="empty-hint">点击右上角"开始分析"按钮生成会议总结</p>
	        </div>

	        <!-- 加载状态 -->
	        <div v-if="isAnalyzing && !hasAnalysisContent" class="analysis-loading" role="status" aria-live="polite">
	          <el-icon class="is-spinning" :size="32"><Loading /></el-icon>
	          <p class="analysis-loading-text">
	            正在分析中，请稍候
	            <span class="loading-dots" aria-hidden="true">
	              <span class="loading-dot" />
	              <span class="loading-dot" />
	              <span class="loading-dot" />
	            </span>
	          </p>
	          <p v-if="analysisProgress" class="analysis-progress">{{ analysisProgress }}</p>
	        </div>

	        <div v-if="isAnalyzing && hasAnalysisContent && analysisProgress" class="analysis-stream-status">
	          {{ analysisProgress }}
	        </div>

	        <!-- 错误状态 -->
	        <div v-if="analysisError && !isAnalyzing" class="analysis-error">
	          <p>{{ analysisError }}</p>
	          <el-button size="small" @click="startAnalysis">重试</el-button>
	        </div>

	        <!-- 分析结果 -->
	        <div v-if="hasAnalysisContent" class="analysis-result" v-html="renderedAnalysisResult" />
	      </div>
	    </section>

	    <!-- 针对性分析面板 -->
	    <section v-show="analysisMode === 'target'" class="target-analysis-panel app-surface">
	      <div class="panel-header">
	        <div class="panel-title-row">
	          <h2>{{ targetAnalysisPanelTitle }}</h2>
	          <el-tag v-if="hasTargetAnalysisContent" type="success" size="small">
	            已分析
	          </el-tag>
	        </div>
	        <div class="panel-actions">
	          <el-button
	            size="small"
	            class="ghost-button"
	            @click="switchToGeneralAnalysis"
	          >
	            返回总结
	          </el-button>
	          <el-button
	            v-if="hasTargetAnalysisContent && !isTargetAnalyzing"
	            size="small"
	            type="primary"
	            plain
	            :icon="Refresh"
	            @click="startTargetAnalysis({ force: true })"
	          >
	            重新分析
	          </el-button>
	        </div>
	      </div>

	      <div class="analysis-content">
	        <!-- 空状态占位符 -->
	        <div v-if="!hasTargetAnalysisContent && !isTargetAnalyzing && !targetAnalysisError" class="analysis-empty">
	          <div class="empty-icon">
	            <el-icon :size="48"><Document /></el-icon>
	          </div>
	          <p class="empty-text">等待分析</p>
	          <p class="empty-hint">点击语句卡片上的"针对性分析"按钮生成分析</p>
	          <div class="empty-actions">
	            <el-button size="small" type="primary" plain @click="startTargetAnalysis({ force: true })">
	              重试
	            </el-button>
	          </div>
	        </div>

	        <!-- 加载状态 -->
	        <div
	          v-if="isTargetAnalyzing && !hasTargetAnalysisContent"
	          class="analysis-loading"
	          role="status"
	          aria-live="polite"
	        >
	          <el-icon class="is-spinning" :size="32"><Loading /></el-icon>
	          <p class="analysis-loading-text">
	            正在针对性分析中，请稍候
	            <span class="loading-dots" aria-hidden="true">
	              <span class="loading-dot" />
	              <span class="loading-dot" />
	              <span class="loading-dot" />
	            </span>
	          </p>
	        </div>

	        <!-- 错误状态 -->
	        <div v-if="targetAnalysisError && !isTargetAnalyzing" class="analysis-error">
	          <p>{{ targetAnalysisError }}</p>
	          <el-button size="small" @click="startTargetAnalysis">重试</el-button>
	        </div>

	        <!-- 分析结果 -->
	        <div v-if="hasTargetAnalysisContent" class="analysis-result" v-html="renderedTargetAnalysisResult" />
	      </div>
	    </section>
      </div>
    </div>

    <MeetingActionBar
      ref="actionBarRef"
      :enabled="actionBarEnabled"
      :compact="isNarrow"
      :disabled="!sessionId"
      :ending="endingSession"
      :isSessionEnded="isSessionEnded"
      :recordingStatus="recordingStatus"
      :isPaused="isPaused"
      @toggle-recording="toggleRecording"
      @toggle-mute="pauseRecording"
      @end-session="endSession"
      @toggle-realtime="realtimeCollapsed = !realtimeCollapsed"
    />

    <SettingsDrawer v-model="settingsDrawerVisible" />
    <DebugDrawer v-model="debugDrawerVisible" :session-id="sessionId" />

  </MainLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Setting,
  Monitor,
  VideoCamera,
  VideoCameraFilled,
  VideoPause,
  WarningFilled,
  Loading,
  ArrowLeft,
  ArrowRight,
  Refresh,
  SortDown,
  SortUp,
  Document,
  MagicStick,
} from '@element-plus/icons-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  appConfigSecurityApi,
  appConfigQueueStatsApi,
  sessionApi,
  speechApi,
  transcriptAnalysisApi,
  transcriptEventSegmentationApi,
  type GlmQueueStats,
  type Session,
  type Speech,
  type TranscriptEventSegment,
} from '@/services/api'
import { getApiBaseUrl } from '@/services/http'
import { clearSettingsPassword, getSettingsPassword, setSettingsPassword } from '@/services/settingsSecurity'
import { transcription } from '@/services/transcription'
import { websocket, type ConnectionStatus, type TranscriptEventSegmentationProgressData } from '@/services/websocket'
import { useAppSettings } from '@/composables/useAppSettings'
import { useBackendConfig } from '@/composables/useBackendConfig'
import { useTranscriptStreamStore } from '@/stores/transcriptStream'
import { useTranscriptEventSegmentationStore } from '@/stores/transcriptEventSegmentation'
import MainLayout from '@/components/MainLayout.vue'
import AppHeader from '@/components/AppHeader.vue'
import TranscriptEventSegmentsPanel from '@/components/TranscriptEventSegmentsPanel.vue'
import DebugDrawer from '@/components/DebugDrawer.vue'
import SettingsDrawer from '@/components/SettingsDrawer.vue'
import MeetingActionBar from '@/components/MeetingActionBar.vue'

const router = useRouter()
const route = useRoute()

// 状态
const sessionId = ref<string>('')
const sessionInfo = ref<Session | null>(null)
const speeches = ref<Speech[]>([])
const recordingStatus = ref<'idle' | 'connecting' | 'recording' | 'paused' | 'error'>('idle')
const isPaused = ref(false)
const realtimeScrollRef = ref<HTMLElement | null>(null)
const focusedEventIndex = ref<number | null>(null)
type HighlightedRange = {
  startEventIndex: number
  endEventIndex: number
  startOffset?: number
  endOffset?: number
}

const highlightedRange = ref<HighlightedRange | null>(null)
const realtimeStickToBottom = ref(true)
const endingSession = ref(false)
const sessionEndedOverride = ref(false)
const wsConnectionStatus = ref<ConnectionStatus | null>(null)
const wsLastNotifiedState = ref<ConnectionStatus['state'] | null>(null)
const suppressNextDisconnectToast = ref(false)
const sessionSetNotified = ref(false)
const aiQueueStats = ref<GlmQueueStats | null>(null)
const aiQueueStatus = ref<'idle' | 'ready' | 'unauthorized' | 'error'>('idle')
const aiQueueError = ref('')
const aiQueuePollIntervalMs = 2500
let aiQueueTimer: ReturnType<typeof setInterval> | null = null
	const debugDrawerVisible = ref(false)
	const settingsDrawerVisible = ref(false)
  const openingSettingsDrawer = ref(false)
	const transcriptSegmentOrder = ref<'asc' | 'desc'>('desc')
	const rebuildingTranscriptSegments = ref(false)
	const realtimeCollapsed = ref(false)
	const isNarrow = ref(false)
	const actionBarEnabled = computed(() => true)
	type MeetingActionBarExpose = { openHelp: () => void; hostEl?: { value: HTMLElement | null } }
	const actionBarRef = ref<MeetingActionBarExpose | null>(null)
	const actionBarInsetPx = ref(0)
	const appBottomInsetStyle = computed(() => `${actionBarInsetPx.value}px`)
	const transcriptStreamStore = useTranscriptStreamStore()
	const transcriptEventSegmentationStore = useTranscriptEventSegmentationStore()
  const { settings: appSettings } = useAppSettings()
  const { backendConfig, refreshBackendConfig } = useBackendConfig()
  const transcriptSegmentTranslationEnabled = computed(
    () => backendConfig.value.transcriptSegmentTranslationEnabled === true
  )
  const showRebuildButton = computed(() => recordingStatus.value === 'idle')
  const transcriptSegmentTranslationAvailable = computed(() => {
    if (transcriptSegmentTranslationEnabled.value) return true
    return transcriptEventSegmentationStore.segments.some(segment => {
      if (typeof segment.translatedContent !== 'string') return false
      return segment.translatedContent.trim().length > 0
    })
  })
  const segmentDisplayMode = ref<'source' | 'translated'>('source')
  const segmentDisplayTouched = ref(false)
  const aiQueueDisplay = computed(() => {
    if (!aiQueueStats.value) return '--'
    return String(aiQueueStats.value.totalPending)
  })
  const aiQueueTagType = computed(() => {
    if (aiQueueStatus.value === 'ready') return 'info'
    return 'warning'
  })
  const aiQueueTooltip = computed(() => {
    if (aiQueueStats.value) {
      const instance = aiQueueStats.value.instanceId || '--'
      return `口径：global.queue + global.inFlight（单实例）；实例：${instance}；不含上游 pending`
    }
    if (aiQueueStatus.value === 'unauthorized') {
      return '未授权：请先验证系统设置密码'
    }
    if (aiQueueError.value) {
      return `队列统计不可用：${aiQueueError.value}`
    }
    return '队列统计不可用'
  })

  function startAiQueueTimer(): void {
    if (aiQueueTimer) return
    aiQueueTimer = setInterval(() => {
      void refreshAiQueueStats()
    }, aiQueuePollIntervalMs)
  }

  function stopAiQueueTimer(): void {
    if (!aiQueueTimer) return
    clearInterval(aiQueueTimer)
    aiQueueTimer = null
  }

  watch(
    transcriptSegmentTranslationAvailable,
    available => {
      if (!available) {
        segmentDisplayMode.value = 'source'
        return
      }
      if (!segmentDisplayTouched.value) {
        segmentDisplayMode.value = 'translated'
      }
    },
    { immediate: true }
  )

  async function verifySettingsPassword(password: string): Promise<boolean> {
    try {
      await appConfigSecurityApi.verify(password)
      return true
    } catch {
      return false
    }
  }

  async function initAiQueuePolling(): Promise<void> {
    void refreshAiQueueStats()
    startAiQueueTimer()
  }

  function resumeAiQueuePolling(): void {
    aiQueueStatus.value = 'idle'
    aiQueueError.value = ''
    void refreshAiQueueStats()
    startAiQueueTimer()
  }

  async function openSettingsDrawer(): Promise<void> {
    if (openingSettingsDrawer.value) return
    openingSettingsDrawer.value = true
    try {
      const status = await appConfigSecurityApi.getStatus()
      const enabled = status?.data?.enabled === true
      if (!enabled) {
        resumeAiQueuePolling()
        settingsDrawerVisible.value = true
        return
      }
      const cachedPassword = getSettingsPassword().trim()
      if (cachedPassword) {
        const verified = await verifySettingsPassword(cachedPassword)
        if (verified) {
          resumeAiQueuePolling()
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
        resumeAiQueuePolling()
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

  async function refreshAiQueueStats(): Promise<void> {
    if (aiQueueStatus.value === 'unauthorized' && !getSettingsPassword().trim()) {
      return
    }
    try {
      const response = await appConfigQueueStatsApi.get()
      const data = response?.data ?? null
      aiQueueStats.value = data
      aiQueueStatus.value = data ? 'ready' : 'error'
      aiQueueError.value = ''
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求失败'
      const normalized = message.toLowerCase()
      const isUnauthorized =
        message.includes('未授权') ||
        message.includes('Settings password') ||
        normalized.includes('unauthorized')
      aiQueueStats.value = null
      aiQueueError.value = message
      aiQueueStatus.value = isUnauthorized ? 'unauthorized' : 'error'
      if (isUnauthorized) {
        clearSettingsPassword()
        stopAiQueueTimer()
      }
    }
  }

	// 分析总结状态
	const analysisScrollRef = ref<HTMLElement | null>(null)
	const analysisResult = ref<string>('')
	const isAnalyzing = ref(false)
	const analysisError = ref<string>('')
	const analysisProgress = ref<string>('')
	const summaryPromptName = ref('')
	let analysisEventSource: EventSource | null = null
	const targetAnalysisStreams = new Map<string, EventSource>()

	// 针对性分析状态
	const analysisMode = ref<'general' | 'target'>('general')
	const targetSegment = ref<TranscriptEventSegment | null>(null)
	type TargetAnalysisCacheEntry = {
	  markdown: string
	  sourceRevision: number
	  promptName?: string
	}
	const targetAnalysisCache = reactive(new Map<string, TargetAnalysisCacheEntry>())
	const targetAnalysisErrors = reactive(new Map<string, string>())
	const targetAnalysisInFlight = reactive(new Set<string>())

	// 全局防抖：避免重复点击触发多个分析/重拆任务
	const globalActionDebounceMs = 800
	let lastGlobalActionAt = 0
	const canTriggerGlobalAction = (): boolean => {
	  const now = Date.now()
	  if (now - lastGlobalActionAt < globalActionDebounceMs) {
	    ElMessage.warning('操作过于频繁，请稍后再试')
	    return false
	  }
	  lastGlobalActionAt = now
	  return true
	}

	const ACTION_BAR_BOTTOM_OFFSET_PX = 12
	let actionBarResizeObserver: ResizeObserver | null = null
	function updateActionBarInset(): void {
	  if (!actionBarEnabled.value) {
	    actionBarInsetPx.value = 0
	    return
	  }
	  const hostEl = actionBarRef.value?.hostEl?.value
	  if (!hostEl) {
	    actionBarInsetPx.value = 0
	    return
	  }
	  const height = hostEl.getBoundingClientRect().height
	  actionBarInsetPx.value = height > 0 ? Math.ceil(height + ACTION_BAR_BOTTOM_OFFSET_PX) : 0
	}

	let mediaQuery: MediaQueryList | null = null
	function updateIsNarrow(): void {
	  if (!mediaQuery) return
	  isNarrow.value = mediaQuery.matches
	}

	function isEditableTarget(target: EventTarget | null): boolean {
	  const el = target as HTMLElement | null
	  if (!el) return false
	  if (el.isContentEditable) return true
	  const tag = el.tagName?.toLowerCase()
	  if (!tag) return false
	  return tag === 'input' || tag === 'textarea' || tag === 'select'
	}

	function handleGlobalKeydown(event: KeyboardEvent): void {
	  if (event.defaultPrevented) return
	  if (event.altKey || event.metaKey || event.ctrlKey) return
	  if (isEditableTarget(event.target)) return

	  const key = event.key?.toLowerCase()
	  if (key === 'm') {
	    if (recordingStatus.value === 'recording' || recordingStatus.value === 'paused') {
	      event.preventDefault()
	      pauseRecording()
	    } else {
	      ElMessage.info('未录音，无法切麦/闭麦')
	    }
	    return
	  }

	  if (key === 'r') {
	    event.preventDefault()
	    void toggleRecording()
	    return
	  }

	  if (event.key === '?') {
	    event.preventDefault()
	    actionBarRef.value?.openHelp()
	  }
	}



async function focusRealtimeRange(payload: {
  start: number
  end: number
  startOffset?: number
  endOffset?: number
}): Promise<void> {
  const start = Math.floor(Number(payload.start) || 0)
  const end = Math.floor(Number(payload.end) || 0)
  const normalizedStart = Math.max(0, Math.min(start, end))
  const normalizedEnd = Math.max(0, Math.max(start, end))

  const hasOffsets =
    typeof payload.startOffset === 'number' && typeof payload.endOffset === 'number' && start <= end
  highlightedRange.value = {
    startEventIndex: normalizedStart,
    endEventIndex: normalizedEnd,
    startOffset: hasOffsets ? Math.max(0, Math.floor(payload.startOffset as number)) : undefined,
    endOffset: hasOffsets ? Math.max(0, Math.floor(payload.endOffset as number)) : undefined,
  }
  await focusRealtimeEventIndex(normalizedStart)
}

	async function focusRealtimeEventIndex(eventIndex: number): Promise<void> {
	  const normalized = Math.max(0, Math.floor(Number(eventIndex) || 0))
	  realtimeCollapsed.value = false
	  await nextTick()
	  const container = realtimeScrollRef.value
	  if (!container) return
	  const target = container.querySelector(`[data-event-index="${normalized}"]`) as HTMLElement | null
	  if (!target) return

	  focusedEventIndex.value = normalized
	  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
	  window.setTimeout(() => {
	    if (focusedEventIndex.value === normalized) {
	      focusedEventIndex.value = null
	    }
	  }, 1200)
	}

function isEventFullyHighlighted(eventIndex: number, content: string): boolean {
  const parts = getEventHighlightParts(eventIndex, content)
  return parts?.mode === 'full'
}

function getEventHighlightParts(
  eventIndex: number,
  content: string
): { mode: 'full' | 'partial'; before: string; highlight: string; after: string } | null {
  const range = highlightedRange.value
  if (!range) return null
  if (eventIndex < range.startEventIndex || eventIndex > range.endEventIndex) return null

  const hasOffsets = typeof range.startOffset === 'number' && typeof range.endOffset === 'number'
  if (!hasOffsets) {
    return { mode: 'full', before: '', highlight: '', after: '' }
  }

  const text = typeof content === 'string' ? content : ''
  if (!text) return null

  const clampOffset = (value: number) => Math.max(0, Math.min(value, text.length))

  if (range.startEventIndex === range.endEventIndex) {
    const start = clampOffset(range.startOffset as number)
    const end = clampOffset(range.endOffset as number)
    if (start >= end) {
      return { mode: 'full', before: '', highlight: '', after: '' }
    }
    if (start === 0 && end === text.length) {
      return { mode: 'full', before: '', highlight: '', after: '' }
    }
    return {
      mode: 'partial',
      before: text.slice(0, start),
      highlight: text.slice(start, end),
      after: text.slice(end),
    }
  }

  if (eventIndex === range.startEventIndex) {
    const start = clampOffset(range.startOffset as number)
    if (start >= text.length) {
      return { mode: 'full', before: '', highlight: '', after: '' }
    }
    if (start === 0) {
      return { mode: 'full', before: '', highlight: '', after: '' }
    }
    return {
      mode: 'partial',
      before: text.slice(0, start),
      highlight: text.slice(start),
      after: '',
    }
  }

  if (eventIndex === range.endEventIndex) {
    const end = clampOffset(range.endOffset as number)
    if (end <= 0) {
      return { mode: 'full', before: '', highlight: '', after: '' }
    }
    if (end === text.length) {
      return { mode: 'full', before: '', highlight: '', after: '' }
    }
    return {
      mode: 'partial',
      before: '',
      highlight: text.slice(0, end),
      after: text.slice(end),
    }
  }

  return { mode: 'full', before: '', highlight: '', after: '' }
}

	function handleRealtimeScroll(): void {
	  const el = realtimeScrollRef.value
	  if (!el) return
	  const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
	  realtimeStickToBottom.value = distanceToBottom < 80
	}

// 计算属性
const isSessionEnded = computed(() => {
  if (sessionEndedOverride.value) return true
  if (!sessionInfo.value) return false
  return !sessionInfo.value.isActive
})

type RecordingTag = { type?: 'success' | 'warning' | 'danger' | 'info'; text: string }

const recordingTag = computed<RecordingTag>(() => {
  if (isSessionEnded.value) return { type: 'info', text: '会话已结束' }
  if (recordingStatus.value === 'recording') return { type: 'success', text: '录制中' }
  if (recordingStatus.value === 'paused') return { type: 'warning', text: '已静音' }
  if (recordingStatus.value === 'connecting') return { type: 'warning', text: '连接中' }
  if (recordingStatus.value === 'error') {
    const wsState = wsConnectionStatus.value?.state
    const hint = wsState === 'failed' || wsState === 'disconnected' ? '连接已断开' : '录音出错'
    return { type: 'danger', text: hint }
  }
  return { type: 'info', text: '未录制' }
})

type RecordingIndicatorStatus = 'recording' | 'idle' | 'paused' | 'connecting' | 'error' | 'ended'

const recordingIndicatorStatus = computed<RecordingIndicatorStatus>(() => {
  if (isSessionEnded.value) return 'ended'
  if (recordingStatus.value === 'recording') return 'recording'
  if (recordingStatus.value === 'paused') return 'paused'
  if (recordingStatus.value === 'connecting') return 'connecting'
  if (recordingStatus.value === 'error') return 'error'
  return 'idle'
})

const recordingIndicatorIcon = computed(() => {
  const status = recordingIndicatorStatus.value
  if (status === 'recording') return VideoCameraFilled
  if (status === 'paused') return VideoPause
  if (status === 'connecting') return Loading
  if (status === 'error') return WarningFilled
  return VideoCamera
})


	const wsReconnectTag = computed(() => {
  const status = wsConnectionStatus.value
  if (!status) return null

  if (status.state === 'reconnecting') {
    const nextRetrySeconds = status.nextRetryMs ? Math.ceil(status.nextRetryMs / 1000) : null
    const nextRetryText = nextRetrySeconds ? `，${nextRetrySeconds}s 后重试` : ''
    return {
      type: 'warning' as const,
      text: `正在重连（${status.attempt}/${status.maxAttempts}）${nextRetryText}`,
    }
  }

  if (status.state === 'failed') {
    return {
      type: 'danger' as const,
      text: '重连失败',
    }
  }

  return null
	})

	const wsRetryVisible = computed(() => {
	  if (isSessionEnded.value || !sessionId.value) return false
	  if (recordingStatus.value !== 'error') return false
	  const state = wsConnectionStatus.value?.state
	  return !state || state === 'failed' || state === 'disconnected'
	})

	const segmentationStageText = computed(() => {
	  const stage = transcriptEventSegmentationStore.progress?.stage
	  if (!stage) return ''
	  const map: Record<string, string> = {
	    queued: '排队中',
	    calling_llm: '调用中',
	    parsing: '解析中',
	    persisting: '落库中',
	    completed: '已完成',
	    failed: '失败',
	  }
	  return map[stage] || stage
	})

	const segmentationStageTagType = computed(() => {
	  const stage = transcriptEventSegmentationStore.progress?.stage
	  if (!stage) return 'info'
	  if (stage === 'failed') return 'danger'
	  if (stage === 'completed') return 'success'
	  if (stage === 'queued' || stage === 'calling_llm' || stage === 'parsing' || stage === 'persisting') {
	    return 'warning'
	  }
	  return 'info'
	})

	const maxAvailableEventIndex = computed(() => {
	  const next = transcriptStreamStore.nextEventIndex
	  if (!Number.isFinite(next) || next <= 0) return null
	  return next - 1
	})

	let hasInitializedSession = false

	async function ensureWebSocketSessionBound(targetSessionId: string): Promise<void> {
	  const normalized = typeof targetSessionId === 'string' ? targetSessionId.trim() : ''
	  if (!normalized) return
	  try {
	    await websocket.connect()
	    websocket.setSession(normalized)
	  } catch (error) {
	    console.error('WebSocket 连接失败:', error)
	  }
	}

	watch(
  () => route.params.id,
  async (nextId) => {
    const paramId = Array.isArray(nextId) ? nextId[0] : nextId
    const queryId = Array.isArray(route.query.id) ? route.query.id[0] : route.query.id
    const nextSessionId = (paramId as string) || (queryId as string) || ''

    if (!hasInitializedSession) {
      sessionId.value = nextSessionId
      hasInitializedSession = true
      return
    }

    if (nextSessionId === sessionId.value) return

    if (recordingStatus.value !== 'idle') {
      stopRecording()
    }

	    sessionId.value = nextSessionId
	    transcriptStreamStore.reset()
	    transcriptEventSegmentationStore.reset()
	    clearAnalysis()
	    clearTargetAnalysis()
	    analysisMode.value = 'general'
	    targetSegment.value = null
	    focusedEventIndex.value = null
	    highlightedRange.value = null
	    realtimeStickToBottom.value = true

    if (!sessionId.value) return

	    // 重新绑定 WebSocket（reset 会解绑，需要重新绑定）
	    transcriptStreamStore.bindWebSocket()
	    transcriptEventSegmentationStore.bindWebSocket()
	    void ensureWebSocketSessionBound(sessionId.value)

    await loadSession()
    await loadSpeeches()
    await transcriptStreamStore.loadSnapshot(sessionId.value)
    await transcriptEventSegmentationStore.loadSnapshot(sessionId.value)
  },
  { immediate: true },
)

	watch(
	  () => transcriptStreamStore.events.length,
	  async () => {
	    if (!realtimeStickToBottom.value) return
	    if (realtimeCollapsed.value) return
	    await nextTick()
	    const el = realtimeScrollRef.value
	    if (!el) return
	    el.scrollTop = el.scrollHeight
	  },
	)

// 初始化
  onMounted(async () => {
    void refreshBackendConfig()
    void initAiQueuePolling()
	  mediaQuery = window.matchMedia('(max-width: 960px)')
	  updateIsNarrow()
	  mediaQuery.addEventListener('change', updateIsNarrow)
	  window.addEventListener('keydown', handleGlobalKeydown, true)

	  await nextTick()
	  const hostEl = actionBarRef.value?.hostEl?.value
	  if (hostEl) {
	    actionBarResizeObserver = new ResizeObserver(updateActionBarInset)
	    actionBarResizeObserver.observe(hostEl)
	    updateActionBarInset()
	  }

	  sessionId.value = route.params.id as string || route.query.id as string || ''
	  if (sessionId.value) {
	    await loadSession()
	    await loadSpeeches()
	    transcriptStreamStore.bindWebSocket()
	    void ensureWebSocketSessionBound(sessionId.value)
	    await transcriptStreamStore.loadSnapshot(sessionId.value)
	    transcriptEventSegmentationStore.bindWebSocket()
	    await transcriptEventSegmentationStore.loadSnapshot(sessionId.value)
	  }
	})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, true)
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', updateIsNarrow)
    mediaQuery = null
  }
  if (aiQueueTimer) {
    clearInterval(aiQueueTimer)
    aiQueueTimer = null
  }
  if (actionBarResizeObserver) {
    actionBarResizeObserver.disconnect()
    actionBarResizeObserver = null
  }
  if (analysisEventSource) {
    analysisEventSource.close()
    analysisEventSource = null
  }
  stopTargetAnalysisStream()
  transcription.dispose()
  transcriptStreamStore.reset()
  transcriptEventSegmentationStore.reset()
})

// 加载会话信息
async function loadSession() {
  try {
    const response = await sessionApi.get(sessionId.value)
    sessionInfo.value = response.data || null
    sessionEndedOverride.value = !!sessionInfo.value && !sessionInfo.value.isActive
    await loadStoredSummary()
  } catch (error) {
    console.error('加载会话失败:', error)
  }
}

// 加载发言记录
async function loadSpeeches() {
  try {
    const response = await speechApi.list(sessionId.value)
    speeches.value = response.data || []
  } catch (error) {
    console.error('加载发言记录失败:', error)
  }
}

	// 结束会话
	async function endSession() {
	  if (!sessionId.value || isSessionEnded.value) return

	  try {
	    await ElMessageBox.confirm(
	      '确定要结束当前会话吗？结束后将无法继续录音。',
	      '结束会话确认',
	      {
	        confirmButtonText: '结束会话',
	        cancelButtonText: '取消',
	        type: 'warning',
	      },
	    )
	  } catch {
	    return
	  }

	  try {
	    endingSession.value = true

	    if (recordingStatus.value !== 'idle') {
	      transcription.stop()
	      recordingStatus.value = 'idle'
	      isPaused.value = false
	      wsConnectionStatus.value = null
	    }

	    await sessionApi.end(sessionId.value)
	    sessionEndedOverride.value = true
	    await loadSession()
	    ElMessage.success('会话已结束')
	  } catch (error) {
	    console.error('结束会话失败:', error)
	    ElMessage.error('结束会话失败')
	  } finally {
	    endingSession.value = false
	  }
	}

		async function rebuildTranscriptSegments(): Promise<void> {
		if (!sessionId.value) return
		if (rebuildingTranscriptSegments.value) return
		if (!canTriggerGlobalAction()) return

	  try {
	    await ElMessageBox.confirm(
	      '这将清空当前会话的语句拆分结果，并从事件 1 重新生成。确定继续吗？',
	      '重拆确认',
	      {
	        confirmButtonText: '重拆',
	        cancelButtonText: '取消',
	        type: 'warning',
	      },
	    )
	  } catch {
	    return
	  }

		  try {
		    rebuildingTranscriptSegments.value = true
		    await ensureWebSocketSessionBound(sessionId.value)
		    const maxAvailable = maxAvailableEventIndex.value ?? 0
		    const optimisticProgress: TranscriptEventSegmentationProgressData = {
		      sessionId: sessionId.value,
		      taskId: 'local-rebuild',
		      mode: 'rebuild',
		      stage: 'queued',
		      pointerEventIndex: 0,
		      windowStartEventIndex: 0,
		      windowEndEventIndex: 0,
		      maxEventIndex: Math.max(0, maxAvailable),
		      sequence: 1,
		      updatedAt: new Date().toISOString(),
		    }
		    transcriptEventSegmentationStore.clearSegments()
		    transcriptEventSegmentationStore.progress = optimisticProgress
		    await transcriptEventSegmentationApi.rebuild(sessionId.value)
		    ElMessage.success('已开始重拆')
		  } catch (error) {
	    console.error('重拆失败:', error)
	    ElMessage.error('重拆失败')
	  } finally {
	    rebuildingTranscriptSegments.value = false
	  }
	}

// 切换录音
async function toggleRecording() {
  if (isSessionEnded.value) {
    ElMessage.warning('会话已结束，无法录音')
    return
  }

  if (recordingStatus.value === 'recording') {
    // 停止录音
    stopRecording()
  } else {
    // 开始录音
    await startRecording()
  }
}

// 开始录音
async function startRecording() {
  try {
    if (isSessionEnded.value) {
      ElMessage.warning('会话已结束，无法录音')
      return
    }

    recordingStatus.value = 'connecting'
    wsLastNotifiedState.value = null
    suppressNextDisconnectToast.value = false
    sessionSetNotified.value = false

    const buildAudioConfig = () => {
      const mode = appSettings.value.audioCaptureMode
      if (mode === 'tab') return { captureMode: 'tab' as const }
      if (mode === 'mix') {
        return appSettings.value.micDeviceId
          ? { captureMode: 'mix' as const, deviceId: appSettings.value.micDeviceId }
          : { captureMode: 'mix' as const }
      }
      return appSettings.value.micDeviceId ? { captureMode: 'mic' as const, deviceId: appSettings.value.micDeviceId } : { captureMode: 'mic' as const }
    }

    // 设置转写服务回调
    await transcription.start({
      sessionId: sessionId.value,
      audio: buildAudioConfig(),
      onTranscript: (transcript: Speech) => {
        const index = speeches.value.findIndex((item) => item.id === transcript.id)
        if (index >= 0) {
          speeches.value.splice(index, 1, transcript)
        } else {
          speeches.value.push(transcript)
        }
      },
      onError: (error: Error) => {
        const rawMessage = error?.message || '未知错误'
        const normalizedMessage = rawMessage.replace(/^(转写错误:\s*)+/g, '')
        ElMessage.error(`转写错误: ${normalizedMessage}`)
      },
      onStatusChange: (status) => {
        recordingStatus.value = status
      },
      onConnectionStatusChange: (status) => {
        wsConnectionStatus.value = status
        if (recordingStatus.value === 'idle') {
          wsLastNotifiedState.value = status.state
          return
        }
        if (wsLastNotifiedState.value === status.state) return

        if (status.state === 'connected') {
          ElMessage.success('实时连接已建立')
        } else if (status.state === 'reconnecting') {
          ElMessage.warning('连接已断开，正在重连')
        } else if (status.state === 'failed') {
          ElMessage.error('连接失败，请检查网络或配置')
        } else if (status.state === 'disconnected' && !suppressNextDisconnectToast.value) {
          ElMessage.warning('连接已关闭')
        }

        if (status.state === 'disconnected') {
          suppressNextDisconnectToast.value = false
        }
        wsLastNotifiedState.value = status.state
      },
      onStatusMessage: (payload) => {
        if (payload?.status !== 'session_set') return
        if (payload.sessionId && payload.sessionId !== sessionId.value) return
        if (sessionSetNotified.value) return
        sessionSetNotified.value = true
        ElMessage.success('转写会话已就绪')
      },
    })

    ElMessage.success('录音已开始')
  } catch (error) {
    console.error('开始录音失败:', error)
    transcription.stop()
    ElMessage.error(error instanceof Error ? `开始录音失败: ${error.message}` : '开始录音失败')
    recordingStatus.value = 'idle'
    isPaused.value = false
    wsConnectionStatus.value = null
  }
}

async function retryRecordingConnection(): Promise<void> {
  if (!wsRetryVisible.value) return
  wsConnectionStatus.value = null
  await startRecording()
}

// 停止录音
function stopRecording() {
  suppressNextDisconnectToast.value = true
  transcription.stop()
  recordingStatus.value = 'idle'
  isPaused.value = false
  wsConnectionStatus.value = null
  ElMessage.info('录音已停止')
}

// 暂停录音
function pauseRecording() {
  if (isPaused.value) {
    transcription.resume()
    isPaused.value = false
  } else {
    transcription.pause()
    isPaused.value = true
  }
}

function formatDurationMs(durationMs: number): string {
  const safeMs = Math.max(0, Math.floor(durationMs))
  if (safeMs < 60_000) {
    return `${(safeMs / 1000).toFixed(1)}s`
  }
  const totalSeconds = Math.floor(safeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getEventDurationText(eventIndex: number): string | null {
  const durationMs = transcriptStreamStore.getEventDurationMs(eventIndex)
  if (durationMs == null) return null
  return formatDurationMs(durationMs)
}

function normalizeMarkdown(markdown: string): string {
  const raw = typeof markdown === 'string' ? markdown : ''
  if (!raw) return ''

  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  let out = raw.replace(/\r\n?/g, '\n')

  // 兼容全角井号（＃）/全角空格
  out = out.replace(/＃/g, '#').replace(/　/g, ' ')

  // 针对模型常见输出：标题未换行，导致整个内容被解析为单个 h1/h2。
  // 这里对“已知标题集合”强制补齐前后换行，确保 heading 独立成行。
  const knownHeadings: Array<{ level: 1 | 2; text: string }> = [
    { level: 1, text: '会议分析总结' },
    { level: 2, text: '一句话结论' },
    { level: 2, text: '议题与结论' },
    { level: 2, text: '关键要点' },
    { level: 2, text: '决策' },
    { level: 2, text: '行动项（TODO）' },
    { level: 2, text: '风险与阻塞' },
    { level: 2, text: '待澄清问题' },
    { level: 2, text: '附：原文引用（可选）' },
    // 针对性分析（可选标题）
    { level: 2, text: '语句解读' },
    { level: 2, text: '可能的意图/风险' },
    { level: 2, text: '建议的追问' },
    { level: 2, text: '建议的下一步行动' },
  ]

  for (const heading of knownHeadings) {
    const hashes = '#'.repeat(heading.level)
    const pattern = new RegExp(`${escapeRegExp(hashes)}\\s*${escapeRegExp(heading.text)}`, 'g')
    out = out.replace(pattern, `\n\n${hashes} ${heading.text}\n\n`)
  }

  // 标题：确保 # 后有空格（避免 “#标题” 无法识别为 heading）
  out = out.replace(/^(\s{0,3})(#{1,6})(?!#)(\S)/gm, '$1$2 $3')

  // 模型常见输出：多个列表项被拼在同一行，且紧跟 HTML（如 *<strong>...*<strong>...）。
  // 仅在 “*< / -< / +<” 这种极不可能是行内强调的场景下断行。
  out = out.replace(/([^\n])([*+-])(?=<)/g, '$1\n$2')

  // 列表：确保列表标记后有空格（避免 “-事项” / “*事项” 无法识别为 list）
  out = out.replace(/^(\s{0,3})([*+-])(\S)/gm, '$1$2 $3')
  out = out.replace(/^(\s{0,3})(\d+\.)(\S)/gm, '$1$2 $3')

  // 收敛空行，避免过多空白
  out = out.replace(/\n{3,}/g, '\n\n').trim()

  return out
}

// 分析总结相关
const renderedAnalysisResult = computed(() => {
  if (!analysisResult.value) return ''
  // 使用 marked.parse 的同步版本
  const rawHtml = marked.parse(normalizeMarkdown(analysisResult.value), {
    async: false,
    gfm: true,
    breaks: true,
  }) as string
  return DOMPurify.sanitize(rawHtml)
})

const hasAnalysisContent = computed(() => !!analysisResult.value)

// 针对性分析相关
const activeTargetAnalysis = computed(() => {
  const seg = targetSegment.value
  if (!seg?.id) return null
  const cached = targetAnalysisCache.get(seg.id)
  if (!cached) return null
  if (cached.sourceRevision !== seg.sourceRevision) return null
  return cached
})

const targetAnalysisMarkdown = computed(() => activeTargetAnalysis.value?.markdown ?? '')

const isTargetAnalyzing = computed(() => {
  const segId = targetSegment.value?.id
  return !!segId && targetAnalysisInFlight.has(segId)
})

const targetAnalysisError = computed(() => {
  const segId = targetSegment.value?.id
  return segId ? targetAnalysisErrors.get(segId) ?? '' : ''
})

const renderedTargetAnalysisResult = computed(() => {
  if (!targetAnalysisMarkdown.value) return ''
  const rawHtml = marked.parse(normalizeMarkdown(targetAnalysisMarkdown.value), {
    async: false,
    gfm: true,
    breaks: true,
  }) as string
  return DOMPurify.sanitize(rawHtml)
})

const hasTargetAnalysisContent = computed(() => !!targetAnalysisMarkdown.value)

const targetAnalysisPromptName = computed(() => {
  const name = activeTargetAnalysis.value?.promptName?.trim()
  return name || '针对性分析'
})

const targetAnalysisPanelTitle = computed(() => {
  const baseTitle = targetAnalysisPromptName.value || '针对性分析'
  const sequence = targetSegment.value?.sequence
  if (Number.isFinite(sequence)) {
    return `${baseTitle} - @${sequence}`
  }
  return baseTitle
})

const analysisPanelTitle = computed(() => {
  return summaryPromptName.value || '分析总结'
})

async function startAnalysis(): Promise<void> {
  if (!sessionId.value) {
    ElMessage.warning('请先加入会话')
    return
  }

  if (transcriptStreamStore.nextEventIndex === 0) {
    ElMessage.warning('暂无原文内容，请先开始录音/转写')
    return
  }

  if (isAnalyzing.value) return
  if (!canTriggerGlobalAction()) return

  if (analysisEventSource) {
    analysisEventSource.close()
    analysisEventSource = null
  }

  isAnalyzing.value = true
  analysisError.value = ''
  analysisProgress.value = '正在连接分析服务…'
  analysisResult.value = ''

  if (typeof EventSource === 'undefined') {
    try {
      const response = await transcriptAnalysisApi.generateSummary(sessionId.value)
      const markdown = response?.data?.markdown
      const promptName = response?.data?.promptName
      if (!markdown) {
        throw new Error('分析服务返回为空')
      }
      analysisResult.value = markdown
      if (typeof promptName === 'string' && promptName.trim()) {
        summaryPromptName.value = promptName.trim()
      }
      ElMessage.success('分析完成')
    } catch (error) {
      console.error('分析失败:', error)
      analysisError.value = error instanceof Error ? error.message : '分析失败'
      ElMessage.error('分析失败')
    } finally {
      analysisProgress.value = ''
      isAnalyzing.value = false
    }
    return
  }

  const baseUrl = String(getApiBaseUrl() || '/api').replace(/\/+$/, '')
	const streamUrl = `${baseUrl}/transcript-analysis/session/${encodeURIComponent(
		sessionId.value
	)}/summary/stream`

	let finished = false
	let hadAnyDelta = false
	let errorProbeInFlight = false
	let consecutiveErrorCount = 0
	analysisEventSource = new EventSource(streamUrl)

	const isNearBottom = (el: HTMLElement, thresholdPx: number): boolean => {
		const threshold = Math.max(0, Math.floor(thresholdPx))
		const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
		return remaining <= threshold
	}

	const scrollToBottomIfNeeded = async (shouldStick: boolean): Promise<void> => {
		if (!shouldStick) return
		await nextTick()
		const el = analysisScrollRef.value
		if (!el) return
		el.scrollTop = el.scrollHeight
	}

  const finishOnce = (payload?: { ok?: boolean; message?: string }) => {
    if (finished) return
    finished = true
    if (analysisEventSource) {
      analysisEventSource.close()
      analysisEventSource = null
    }
    analysisProgress.value = ''
    isAnalyzing.value = false

    if (payload?.ok) {
      ElMessage.success('分析完成')
    } else if (payload?.message) {
      analysisError.value = payload.message
      ElMessage.error('分析失败')
    }
  }

  analysisEventSource.addEventListener('progress', (event) => {
    const message = (event as MessageEvent).data
    if (typeof message === 'string' && message.trim()) {
      analysisProgress.value = message
    }
  })

  analysisEventSource.addEventListener('meta', (event) => {
    const raw = (event as MessageEvent).data
    let data: any = raw
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw)
      } catch {
        data = {}
      }
    }
    if (typeof data?.promptName === 'string' && data.promptName.trim()) {
      summaryPromptName.value = data.promptName.trim()
    }
  })

	analysisEventSource.addEventListener('delta', (event) => {
		const el = analysisScrollRef.value
		const shouldStick = el ? isNearBottom(el, 120) : true
		const text = (event as MessageEvent).data
		if (typeof text === 'string' && text) {
			hadAnyDelta = true
			analysisResult.value += text
			void scrollToBottomIfNeeded(shouldStick)
		}
	})

	analysisEventSource.addEventListener('done', () => {
		finishOnce({ ok: true })
	})

	analysisEventSource.onmessage = (event) => {
		const raw = (event as MessageEvent).data
		if (typeof raw !== 'string' || !raw.trim()) return

		const el = analysisScrollRef.value
		const shouldStick = el ? isNearBottom(el, 120) : true

		if (!raw.trimStart().startsWith('{')) {
			hadAnyDelta = true
			analysisResult.value += raw
			void scrollToBottomIfNeeded(shouldStick)
			return
		}

		try {
			const parsed = JSON.parse(raw)
			const type = parsed?.type
			const data = parsed?.data
			if (type === 'meta' && data) {
				if (typeof data.promptName === 'string' && data.promptName.trim()) {
					summaryPromptName.value = data.promptName.trim()
				}
				return
			}
			if (type === 'progress' && typeof data === 'string') {
				analysisProgress.value = data
				return
			}
			if (type === 'delta' && typeof data === 'string') {
				hadAnyDelta = true
				analysisResult.value += data
				void scrollToBottomIfNeeded(shouldStick)
				return
			}
			if (type === 'done') {
				finishOnce({ ok: true })
				return
			}
			if (type === 'server_error') {
				const message = data?.message ? String(data.message) : '分析失败'
				finishOnce({ ok: false, message })
			}
		} catch {
			// ignore
		}
	}

	analysisEventSource.addEventListener('server_error', (event) => {
		const raw = (event as MessageEvent).data
		try {
			const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const message = parsed?.message ? String(parsed.message) : '分析失败'
      finishOnce({ ok: false, message })
    } catch {
      finishOnce({ ok: false, message: typeof raw === 'string' ? raw : '分析失败' })
		}
	})

	analysisEventSource.onerror = async () => {
		if (finished) return
		consecutiveErrorCount += 1
		analysisProgress.value = '分析连接中断，正在重连…'

		const readyState = analysisEventSource?.readyState
		console.error('[analysis SSE error]', { streamUrl, readyState, consecutiveErrorCount })

		if (consecutiveErrorCount < 3) {
			return
		}

		if (!errorProbeInFlight) {
			errorProbeInFlight = true
			try {
				const controller = new AbortController()
				const timer = window.setTimeout(() => controller.abort(), 3000)
				const resp = await fetch(streamUrl, {
					method: 'GET',
					headers: { Accept: 'text/event-stream' },
					signal: controller.signal,
				})
				window.clearTimeout(timer)

				if (!resp.ok) {
					const text = await resp.text().catch(() => '')
					const detail = text ? ` ${text.slice(0, 300)}` : ''
					finishOnce({ ok: false, message: `分析流式接口返回异常：HTTP ${resp.status}.${detail}` })
					return
				}
			} catch (error) {
				console.error('[analysis SSE probe failed]', error)
			} finally {
				errorProbeInFlight = false
			}
		}

		const suffix = hadAnyDelta ? '（已接收部分内容）' : ''
		finishOnce({ ok: false, message: `分析连接中断，请重试${suffix}` })
	}
}

async function loadStoredSummary(): Promise<void> {
  if (!sessionId.value) return
  if (isAnalyzing.value) return
  if (analysisResult.value) return

  try {
    const response = await transcriptAnalysisApi.getStoredSummary(sessionId.value)
    const markdown = response?.data?.markdown
    const promptName = response?.data?.promptName
    if (typeof markdown === 'string' && markdown.trim()) {
      analysisResult.value = markdown
    }
    if (typeof promptName === 'string' && promptName.trim()) {
      summaryPromptName.value = promptName.trim()
    }
  } catch (error) {
    console.error('加载已保存分析总结失败:', error)
  }
}

function clearAnalysis(): void {
  if (analysisEventSource) {
    analysisEventSource.close()
    analysisEventSource = null
  }
  analysisResult.value = ''
  analysisError.value = ''
  analysisProgress.value = ''
}

function stopTargetAnalysisStream(segmentId?: string): void {
  if (segmentId) {
    const stream = targetAnalysisStreams.get(segmentId)
    if (stream) {
      stream.close()
      targetAnalysisStreams.delete(segmentId)
    }
    targetAnalysisInFlight.delete(segmentId)
    return
  }
  for (const [id, stream] of targetAnalysisStreams) {
    stream.close()
    targetAnalysisInFlight.delete(id)
  }
  targetAnalysisStreams.clear()
}

// 切换到针对性分析模式
function handleTargetAnalysis(segment: TranscriptEventSegment): void {
  targetSegment.value = segment
  analysisMode.value = 'target'
  // 自动开始针对性分析
  void startTargetAnalysis()
}

// 切换回通用分析模式
function switchToGeneralAnalysis(): void {
  analysisMode.value = 'general'
  targetSegment.value = null
}

// 开始针对性分析
async function startTargetAnalysis(options?: { force?: boolean }): Promise<void> {
  if (!sessionId.value) {
    ElMessage.warning('请先加入会话')
    return
  }

  if (!targetSegment.value) {
    ElMessage.warning('请先选择要分析的语句')
    return
  }

  const seg = targetSegment.value
  const segId = seg.id
  if (!segId) {
    ElMessage.warning('语句缺少标识，无法分析')
    return
  }

  const force = options?.force === true

  const cached = targetAnalysisCache.get(segId)
  if (!force && cached && cached.sourceRevision === seg.sourceRevision) {
    targetAnalysisErrors.delete(segId)
    return
  }

  if (targetAnalysisInFlight.has(segId)) {
    if (!force) return
    stopTargetAnalysisStream(segId)
  }

  if (!force) {
    try {
      const stored = await transcriptAnalysisApi.getStoredSegmentAnalysis(sessionId.value, seg.id)
      const payload = stored?.data
      if (
        payload &&
        typeof payload.markdown === 'string' &&
        payload.markdown.trim() &&
        payload.sourceRevision === seg.sourceRevision
      ) {
        targetAnalysisCache.set(segId, {
          markdown: payload.markdown,
          sourceRevision: payload.sourceRevision,
          promptName:
            typeof payload.promptName === 'string' ? payload.promptName.trim() : undefined,
        })
        targetAnalysisErrors.delete(segId)
        return
      }
    } catch (error) {
      console.error('加载已保存针对性分析失败:', error)
    }
  }

  if (!canTriggerGlobalAction()) return

  targetAnalysisErrors.delete(segId)
  targetAnalysisInFlight.add(segId)
  const activeSessionId = sessionId.value

  if (typeof EventSource === 'undefined') {
    try {
      const response = await transcriptAnalysisApi.generateSegmentAnalysis(sessionId.value, seg.id)
      const markdown = response?.data?.markdown
      if (!markdown) {
        throw new Error('分析服务返回为空')
      }
      if (activeSessionId === sessionId.value) {
        targetAnalysisCache.set(segId, {
          markdown,
          sourceRevision: seg.sourceRevision,
          promptName:
            typeof response?.data?.promptName === 'string'
              ? response.data.promptName.trim()
              : undefined,
        })
        targetAnalysisErrors.delete(segId)
      }

      ElMessage.success(`针对性分析完成 - @${seg.sequence}`)
    } catch (error) {
      console.error('针对性分析失败:', error)
      const message = error instanceof Error ? error.message : '分析失败'
      if (activeSessionId === sessionId.value) {
        targetAnalysisErrors.set(segId, message)
        ElMessage.error('针对性分析失败')
      }
    } finally {
      targetAnalysisInFlight.delete(segId)
    }
    return
  }

  const baseUrl = String(getApiBaseUrl() || '/api').replace(/\/+$/, '')
  const forceParam = force ? '1' : ''
  const querySuffix = forceParam ? `?force=${forceParam}` : ''
  const streamUrl = `${baseUrl}/transcript-analysis/session/${encodeURIComponent(
    sessionId.value
  )}/segment/${encodeURIComponent(segId)}/analysis/stream${querySuffix}`

  let finished = false
  let hadAnyDelta = false
  let markdownBuffer = ''
  let promptName = ''
  const targetAnalysisEventSource = new EventSource(streamUrl)
  targetAnalysisStreams.set(segId, targetAnalysisEventSource)

  const updateCache = () => {
    if (activeSessionId !== sessionId.value) return
    targetAnalysisCache.set(segId, {
      markdown: markdownBuffer,
      sourceRevision: seg.sourceRevision,
      promptName: promptName || undefined,
    })
    targetAnalysisErrors.delete(segId)
  }

  const finishOnce = (payload?: { ok?: boolean; message?: string }) => {
    if (finished) return
    finished = true
    stopTargetAnalysisStream(segId)

    if (payload?.ok) {
      ElMessage.success(`针对性分析完成 - @${seg.sequence}`)
      return
    }
    if (payload?.message && activeSessionId === sessionId.value) {
      targetAnalysisErrors.set(segId, payload.message)
      ElMessage.error('针对性分析失败')
    }
  }

  targetAnalysisEventSource.addEventListener('meta', (event) => {
    if (finished) return
    if (hadAnyDelta && markdownBuffer) {
      markdownBuffer = ''
      hadAnyDelta = false
    }
    const raw = (event as MessageEvent).data
    let data: any = raw
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw)
      } catch {
        data = {}
      }
    }
    if (typeof data?.promptName === 'string') {
      promptName = data.promptName.trim()
    }
    updateCache()
  })

  targetAnalysisEventSource.addEventListener('delta', (event) => {
    if (finished) return
    const text = (event as MessageEvent).data
    if (typeof text === 'string' && text) {
      hadAnyDelta = true
      markdownBuffer += text
      updateCache()
    }
  })

  targetAnalysisEventSource.addEventListener('done', () => {
    finishOnce({ ok: true })
  })

  targetAnalysisEventSource.onmessage = (event) => {
    if (finished) return
    const raw = (event as MessageEvent).data
    if (typeof raw !== 'string' || !raw.trim()) return

    if (!raw.trimStart().startsWith('{')) {
      hadAnyDelta = true
      markdownBuffer += raw
      updateCache()
      return
    }

    try {
      const parsed = JSON.parse(raw)
      const type = parsed?.type
      const data = parsed?.data
      if (type === 'meta' && data) {
        if (hadAnyDelta && markdownBuffer) {
          markdownBuffer = ''
          hadAnyDelta = false
        }
        if (typeof data.promptName === 'string') {
          promptName = data.promptName.trim()
        }
        updateCache()
        return
      }
      if (type === 'delta' && typeof data === 'string') {
        hadAnyDelta = true
        markdownBuffer += data
        updateCache()
        return
      }
      if (type === 'done') {
        finishOnce({ ok: true })
        return
      }
      if (type === 'server_error') {
        const message = data?.message ? String(data.message) : '分析失败'
        finishOnce({ ok: false, message })
      }
    } catch {
      // ignore
    }
  }

  targetAnalysisEventSource.addEventListener('server_error', (event) => {
    if (finished) return
    const raw = (event as MessageEvent).data
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const message = parsed?.message ? String(parsed.message) : '分析失败'
      finishOnce({ ok: false, message })
    } catch {
      finishOnce({ ok: false, message: typeof raw === 'string' ? raw : '分析失败' })
    }
  })

  targetAnalysisEventSource.onerror = () => {
    if (finished) return
    const suffix = hadAnyDelta ? '（已接收部分内容）' : ''
    finishOnce({ ok: false, message: `分析连接中断，请重试${suffix}` })
  }
}

function clearTargetAnalysis(): void {
  stopTargetAnalysisStream()
  targetAnalysisCache.clear()
  targetAnalysisErrors.clear()
  targetAnalysisInFlight.clear()
}
</script>

<style scoped>
.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.header-icon-button {
  width: 24px;
  height: 24px;
  padding: 0;
  flex: 0 0 auto;
}

.header-icon-button :deep(.el-icon) {
  font-size: 15px;
}

.header-icon-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.header-icon-group :deep(.el-button + .el-button) {
  margin-left: 0;
}

.queue-tag {
  white-space: nowrap;
}

.recording-indicator {
  --indicator-bg: rgba(255, 255, 255, 0.55);
  --indicator-border: rgba(15, 23, 42, 0.14);
  --indicator-color: var(--ink-700);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--indicator-border);
  background: var(--indicator-bg);
  color: var(--indicator-color);
  border-radius: 10px;
  backdrop-filter: blur(10px);
  transition: border-color 0.2s var(--ease-out), background 0.2s var(--ease-out),
    color 0.2s var(--ease-out), border-radius 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}

.recording-indicator.is-recording {
  --indicator-bg: rgba(239, 68, 68, 0.16);
  --indicator-border: rgba(239, 68, 68, 0.5);
  --indicator-color: var(--danger-500);
  border-radius: 999px;
  animation: recording-pulse 1.2s var(--ease-out) infinite;
}

.recording-indicator.is-paused,
.recording-indicator.is-connecting {
  --indicator-bg: rgba(245, 158, 11, 0.16);
  --indicator-border: rgba(245, 158, 11, 0.5);
  --indicator-color: var(--warning-500);
}

.recording-indicator.is-error {
  --indicator-bg: rgba(239, 68, 68, 0.12);
  --indicator-border: rgba(239, 68, 68, 0.5);
  --indicator-color: var(--danger-500);
}

.recording-indicator.is-ended {
  --indicator-bg: rgba(148, 163, 184, 0.18);
  --indicator-border: rgba(148, 163, 184, 0.5);
  --indicator-color: rgba(15, 23, 42, 0.55);
}

.recording-indicator :deep(.is-spinning) {
  animation: indicator-spin 1s linear infinite;
}

@keyframes recording-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.35);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

@keyframes indicator-spin {
  to {
    transform: rotate(360deg);
  }
}

.ghost-icon {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.55);
  color: var(--ink-700);
}

.ws-tag {
  max-width: 46vw;
}

.ws-retry-button {
  height: 24px;
  padding: 0 8px;
}

.ws-retry-button :deep(.el-icon) {
  font-size: 14px;
}

@media (max-width: 480px) {
  .header-right {
    gap: 6px;
  }

  .header-icon-group {
    gap: 4px;
  }

  .header-icon-button {
    width: 22px;
    height: 22px;
  }

  .header-icon-button :deep(.el-icon) {
    font-size: 14px;
  }
}

.ghost-button {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.55);
}

/* 实时转写固定区域（上部） */
.realtime-transcript-bar {
  flex-shrink: 0;
  height: 220px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.realtime-transcript-bar.collapsed {
  height: 42px;
}

.realtime-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(10px);
}

.realtime-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.realtime-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink-900);
}

.realtime-status {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.realtime-content {
  flex: 1;
  overflow: hidden;
  padding: 10px 0 10px;
}

.realtime-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-size: var(--app-transcript-font-size, 13px);
}

.realtime-stream-scroll {
  padding: 0px 10px;
  overflow-y: auto;
  height: 100%;
}

.realtime-event-item {
  display: inline;
  font-size: var(--app-transcript-font-size, 13px);
  line-height: 1.8;
  animation: rise-in 220ms var(--ease-out) both;
  animation-delay: calc(var(--stagger, 0) * 20ms);
}

.realtime-stream {
  color: var(--ink-900);
  white-space: pre-wrap;
  word-break: break-word;
}

.event-inline-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 6px;
  vertical-align: baseline;
}

.realtime-event-item.is-focused {
  box-shadow: 0 0 0 4px rgba(47, 107, 255, 0.10);
  border-radius: 8px;
}

.realtime-event-item.is-highlighted {
  background: rgba(245, 158, 11, 0.22);
  border-radius: 8px;
}

.realtime-event-item.is-highlighted.is-focused {
  background: rgba(245, 158, 11, 0.28);
}

.event-index {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(47, 107, 255, 0.10);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 500;
}

.event-text {
  color: var(--ink-900);
  line-height: 1.6;
}

.event-text-highlight {
  background: rgba(245, 158, 11, 0.32);
  border-radius: 4px;
  padding: 0 2px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.realtime-event-item.is-draft .event-text {
  color: var(--ink-500);
}

.event-duration {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.06);
  color: #475569;
  font-size: 11px;
  font-family:
    "JetBrains Mono",
    "SFMono-Regular",
    ui-monospace,
    "SF Mono",
    Menlo,
    monospace;
}

.event-sep {
  display: inline;
}

.workspace-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

/* 下部内容区域（左右分栏） */
.content-area {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
  overflow: visible;
}

.content-area.narrow {
  grid-template-columns: 1fr;
}

.mobile-pane-switch {
  display: flex;
  gap: 8px;
  padding: 8px;
}

.pane-tab {
  flex: 1;
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 650;
  color: var(--ink-700);
  transition:
    transform 200ms var(--ease-out),
    background 200ms var(--ease-out),
    border-color 200ms var(--ease-out),
    color 200ms var(--ease-out);
}

.pane-tab:hover {
  transform: translateY(-1px);
}

.pane-tab.is-active {
  background: rgba(47, 107, 255, 0.14);
  border-color: rgba(47, 107, 255, 0.30);
  color: var(--ink-900);
}

/* 转写面板 */
.transcript-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.transcript-content {
  flex: 1;
  overflow: hidden;
  padding:10px 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.40);
  backdrop-filter: blur(10px);
}

.panel-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  color: var(--ink-900);
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.segment-display-toggle .el-radio-button__inner {
  padding: 4px 10px;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.segment-order-trigger {
  border-color: rgba(31, 41, 55, 0.18);
  color: #4b5563;
  background: rgba(255, 255, 255, 0.7);
}

.segment-order-trigger:hover {
  border-color: rgba(24, 144, 255, 0.40);
  color: #185abc;
  background: rgba(24, 144, 255, 0.06);
}


@media (min-width: 1201px) {
  .workspace-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    align-items: stretch;
  }

  .workspace-grid.realtime-collapsed {
    grid-template-columns: 72px minmax(0, 1fr) minmax(0, 1fr);
  }

  .realtime-transcript-bar {
    height: auto;
    min-height: 0;
  }

  .realtime-transcript-bar.collapsed {
    height: auto;
  }

  .realtime-transcript-bar.collapsed .realtime-content,
  .realtime-transcript-bar.collapsed .realtime-status {
    display: none;
  }

  .realtime-transcript-bar.collapsed .realtime-header {
    height: 100%;
    padding: 10px 8px;
    justify-content: center;
  }

  .realtime-transcript-bar.collapsed .realtime-title {
    flex-direction: column;
    gap: 8px;
    text-align: center;
  }

  .realtime-transcript-bar.collapsed .realtime-title h3 {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    line-height: 1.1;
  }

  .realtime-transcript-bar.collapsed .ghost-button {
    padding: 6px 8px;
  }

  .content-area {
    display: contents;
  }
}

/* 响应式 */
@media (max-width: 768px) {
  .realtime-transcript-bar {
    height: 190px;
  }
}

/* 分析总结面板 */
.analysis-panel,
.target-analysis-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.analysis-content {
  flex: 1;
  overflow: auto;
  padding: 10px 0;
}

/* 原始语句预览 */
.target-segment-preview {
  padding: 12px 14px 14px;
  margin: 0 0 10px;
  border-radius: 8px;
  background: rgba(47, 107, 255, 0.06);
  border: 1px solid rgba(47, 107, 255, 0.15);
}

.preview-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-700);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preview-content {
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.8);
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--ink-900);
  font-size: 14px;
}

.preview-meta {
  display: flex;
  justify-content: flex-end;
}

.preview-tag {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(47, 107, 255, 0.12);
  color: var(--brand-600);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* 空状态 */
.analysis-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  color: var(--ink-400);
  text-align: center;
  padding: 20px;
}

.empty-icon {
  color: var(--ink-300);
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--ink-500);
  margin: 0 0 8px;
}

.empty-hint {
  font-size: 13px;
  color: var(--ink-400);
  margin: 0;
  max-width: 280px;
}

.empty-actions {
  margin-top: 12px;
}

/* 加载状态 */
.analysis-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  color: var(--ink-500);
  gap: 16px;
}

.analysis-loading p {
  margin: 0;
  font-size: 14px;
}

.analysis-loading-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.loading-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transform: translateY(1px);
}

.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.25;
  animation: meeting-loading-dot 1.2s infinite ease-in-out;
}

.loading-dot:nth-child(2) {
  animation-delay: -0.3s;
}

.loading-dot:nth-child(3) {
  animation-delay: -0.15s;
}

@keyframes meeting-loading-dot {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.25;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-dot {
    animation: none;
    opacity: 0.6;
    transform: none;
  }
}

.analysis-progress {
  font-size: 13px;
  color: var(--ink-400);
}

.analysis-stream-status {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0 12px 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(47, 107, 255, 0.14);
  background: rgba(47, 107, 255, 0.06);
  color: var(--ink-600);
  font-size: 13px;
  backdrop-filter: blur(8px);
}

/* 错误状态 */
.analysis-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  color: var(--danger-500);
  gap: 12px;
  text-align: center;
  padding: 20px;
}

/* 分析结果 - Markdown 渲染 */
.analysis-result {
  padding: 0 12px;
  color: var(--ink-900);
  font-size: var(--app-analysis-font-size, 16px);
  line-height: 1.7;
}

.analysis-result:deep(h1) {
  font-size: calc(var(--app-analysis-font-size, 16px) + 4px);
  font-weight: 650;
  margin: 0 0 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(15, 23, 42, 0.10);
}

.analysis-result:deep(h2) {
  font-size: calc(var(--app-analysis-font-size, 16px) + 1px);
  font-weight: 600;
  margin: 20px 0 12px;
}

.analysis-result:deep(h3) {
  font-size: calc(var(--app-analysis-font-size, 16px) - 1px);
  font-weight: 600;
  margin: 16px 0 8px;
}

.analysis-result:deep(h4),
.analysis-result:deep(h5),
.analysis-result:deep(h6) {
  font-size: calc(var(--app-analysis-font-size, 16px) - 2px);
  font-weight: 600;
  margin: 14px 0 6px;
}

.analysis-result:deep(p) {
  margin: 8px 0;
}

.analysis-result:deep(ul),
.analysis-result:deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.analysis-result:deep(li) {
  margin: 4px 0;
}

.analysis-result:deep(code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.08);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: calc(var(--app-analysis-font-size, 16px) - 3px);
}

.analysis-result:deep(pre) {
  padding: 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.95);
  overflow-x: auto;
  margin: 12px 0;
}

.analysis-result:deep(pre code) {
  padding: 0;
  background: transparent;
  color: #e2e8f0;
}

.analysis-result:deep(strong) {
  font-weight: 600;
  color: var(--brand-700);
}

.analysis-result:deep(em) {
  font-style: italic;
}

.analysis-result:deep(blockquote) {
  margin: 12px 0;
  padding-left: 16px;
  border-left: 3px solid rgba(47, 107, 255, 0.4);
  color: var(--ink-600);
}

.analysis-result:deep(hr) {
  border: none;
  border-top: 1px solid rgba(15, 23, 42, 0.10);
  margin: 20px 0;
}

.analysis-result:deep(a) {
  color: var(--brand-600);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.analysis-result:deep(a:hover) {
  color: var(--brand-700);
}

.analysis-result:deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.analysis-result:deep(del) {
  color: var(--ink-500);
}

.analysis-result:deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.10);
}

.analysis-result:deep(th),
.analysis-result:deep(td) {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  vertical-align: top;
}

.analysis-result:deep(th) {
  background: rgba(15, 23, 42, 0.04);
  font-weight: 600;
}

.analysis-result:deep(tr:last-child td) {
  border-bottom: none;
}

.analysis-result:deep(input[type="checkbox"]) {
  margin-right: 6px;
  transform: translateY(1px);
}

/* 三列布局适配 - 在大屏时将 content-area 改为三列 */
@media (min-width: 1201px) {
  .content-area {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}
</style>
