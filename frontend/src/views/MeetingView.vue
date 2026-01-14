<template>
  <MainLayout :style="{ '--app-bottom-inset': actionBarEnabled ? (isNarrow ? '128px' : '84px') : '0px' }">
    <template #header>
      <AppHeader
        title="AI会议助手"
        :showBackButton="true"
        :status="sessionInfo?.isActive ? 'active' : 'ended'"
        @back="router.push('/')"
      />

      <div class="header-right">
        <el-tag :type="recordingTag.type" size="small" class="recording-tag">
          <span class="recording-dot" />
          {{ recordingTag.text }}
        </el-tag>

        <el-tag v-if="wsReconnectTag" :type="wsReconnectTag.type" size="small" class="ws-tag">
          {{ wsReconnectTag.text }}
        </el-tag>

        <el-tooltip content="设置" placement="bottom">
          <el-button size="small" circle class="ghost-icon" @click="settingsDrawerVisible = true">
            <el-icon><Setting /></el-icon>
            <span class="sr-only">设置</span>
          </el-button>
        </el-tooltip>

        <el-button
          size="small"
          type="warning"
          plain
          class="debug-trigger"
          :disabled="!sessionId"
          @click="debugDrawerVisible = true"
        >
          调试
        </el-button>
      </div>
    </template>

    <!-- 上部：原文流（豆包语音识别） -->
    <section :class="['realtime-transcript-bar', { collapsed: realtimeCollapsed }]" class="app-surface">
      <div class="realtime-header">
        <div class="realtime-title">
          <h3>原文流</h3>
          <el-button size="small" class="ghost-button" @click="realtimeCollapsed = !realtimeCollapsed">
            {{ realtimeCollapsed ? '展开' : '折叠' }}
          </el-button>
        </div>
	        <div class="realtime-status">
	          <el-tag v-if="recordingStatus === 'recording'" type="success" size="small">录制中</el-tag>
	          <el-tag v-else-if="recordingStatus === 'paused'" type="warning" size="small">已暂停</el-tag>
	          <el-tag v-else type="info" size="small">未录制</el-tag>
	          <el-tag type="info" size="small">事件数: {{ transcriptStreamStore.events.length }}</el-tag>
	          <el-tag
	            v-if="transcriptEventSegmentationStore.pointerEventIndex != null"
	            :type="transcriptEventSegmentationStore.isInFlight ? 'warning' : 'info'"
	            size="small"
	          >
	            {{ transcriptEventSegmentationStore.isInFlight ? '拆分中' : '已拆分到' }}:
	            #{{ transcriptEventSegmentationStore.pointerEventIndex }}
	            <template v-if="maxAvailableEventIndex != null">
	              /#{{ maxAvailableEventIndex }}
	            </template>
	          </el-tag>
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

    <div v-if="isNarrow" class="mobile-pane-switch app-surface" role="tablist" aria-label="工作台分区">
      <button
        type="button"
        :class="['pane-tab', activePane === 'segments' ? 'is-active' : '']"
        role="tab"
        :aria-selected="activePane === 'segments'"
        @click="activePane = 'segments'"
      >
        语句拆分
      </button>
      <button
        type="button"
        :class="['pane-tab', activePane === 'analysis' ? 'is-active' : '']"
        role="tab"
        :aria-selected="activePane === 'analysis'"
        @click="activePane = 'analysis'"
      >
        AI分析
      </button>
    </div>

    <!-- 下部：左右分栏 -->
    <div class="content-area" :class="{ narrow: isNarrow }">
      <!-- 下左：GLM 拆分后的独立发言 -->
	      <transition name="panel-fade" mode="out-in">
	      <section v-if="!isNarrow || activePane === 'segments'" class="transcript-panel app-surface">
	      <div class="panel-header">
	        <h2>语句拆分</h2>
	        <div class="panel-actions">
	          <el-button
	            size="small"
	            type="danger"
	            plain
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
	          @select-range="focusRealtimeRange"
	        />
	      </div>
	    </section>
	    </transition>

    <!-- 右侧：AI分析区 -->
    <transition name="panel-fade" mode="out-in">
    <section v-if="!isNarrow || activePane === 'analysis'" class="analysis-panel app-surface">
      <div class="panel-header">
        <h2>AI分析</h2>
        <div class="analysis-header-right">
          <el-button size="small" class="ghost-button" @click="promptDialogVisible = true">
            提示词：{{ selectedPromptTemplate?.name || '未选择' }}
          </el-button>
          <el-tag v-if="currentAnalysis?.isCached" type="info" size="small">缓存</el-tag>
        </div>
      </div>
      <div class="analysis-content">
        <div v-if="analysisLoading" v-loading="true" class="analysis-loading"></div>
        <div v-else-if="currentAnalysis" class="analysis-result">
          <div class="analysis-meta">
            <span>模型: {{ currentAnalysis.modelUsed }}</span>
            <span v-if="currentAnalysis.processingTime">耗时: {{ currentAnalysis.processingTime }}ms</span>
            <span>状态: {{ statusText }}</span>
          </div>
          <div class="analysis-text" v-html="renderMarkdown(currentAnalysis.result)"></div>
          <div class="analysis-actions">
            <el-dropdown split-button type="primary" @click="exportAnalysis('txt')" @command="exportAnalysis">
              <span>导出</span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="txt">纯文本 (.txt)</el-dropdown-item>
                  <el-dropdown-item command="md">Markdown (.md)</el-dropdown-item>
                  <el-dropdown-item command="json">JSON (.json)</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button size="small" @click="copyAnalysis">复制</el-button>
            <el-button size="small" type="primary" @click="generateAnalysis">重新生成</el-button>
          </div>
        </div>
        <div v-else class="empty-state">
          <el-empty description="停止录音后将自动生成分析（可在此选择提示词模板）" />
        </div>
      </div>
    </section>
    </transition>
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
      @open-prompts="promptDialogVisible = true"
      @end-session="endSession"
      @toggle-realtime="realtimeCollapsed = !realtimeCollapsed"
    />

    <SettingsDrawer v-model="settingsDrawerVisible" />
    <DebugDrawer v-model="debugDrawerVisible" :session-id="sessionId" />

    <el-dialog
      v-model="promptDialogVisible"
      title="提示词选择"
      width="min(92vw, 640px)"
      append-to-body
    >
      <el-select v-model="selectedPromptTemplateId" placeholder="选择提示词模板" style="width: 100%">
        <el-option v-for="tpl in promptTemplates" :key="tpl.id" :label="tpl.name" :value="tpl.id" />
      </el-select>
      <div class="prompt-preview">
        <div class="prompt-preview-title">模板内容预览</div>
        <pre class="prompt-preview-body">{{ selectedPromptTemplate?.prompt || '' }}</pre>
      </div>
      <template #footer>
        <el-button size="small" class="ghost-button" @click="settingsDrawerVisible = true">管理模板</el-button>
        <el-button size="small" @click="promptDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
	import { Setting } from '@element-plus/icons-vue'
	import {
	  sessionApi,
	  speechApi,
	  analysisApi,
	  transcriptEventSegmentationApi,
	  type Session,
	  type Speech,
	  type AIAnalysis,
	} from '@/services/api'
	import { exportAnalysis as exportAnalysisService, type ExportFormat } from '@/services/export'
	import { transcription } from '@/services/transcription'
	import { websocket, type ConnectionStatus, type TranscriptEventSegmentationProgressData } from '@/services/websocket'
		import { useTranscriptStreamStore } from '@/stores/transcriptStream'
		import { useTranscriptEventSegmentationStore } from '@/stores/transcriptEventSegmentation'
		import { useAppSettings } from '@/composables/useAppSettings'
import MainLayout from '@/components/MainLayout.vue'
import AppHeader from '@/components/AppHeader.vue'
import TranscriptEventSegmentsPanel from '@/components/TranscriptEventSegmentsPanel.vue'
import DebugDrawer from '@/components/DebugDrawer.vue'
import SettingsDrawer from '@/components/SettingsDrawer.vue'
import MeetingActionBar from '@/components/MeetingActionBar.vue'

const router = useRouter()
const route = useRoute()
const { settings, updateSettings } = useAppSettings()

// 状态
const sessionId = ref<string>('')
const sessionInfo = ref<Session | null>(null)
const speeches = ref<Speech[]>([])
const selectedSpeechId = ref<string>('')
const currentAnalysis = ref<AIAnalysis | null>(null)
const analysisLoading = ref(false)
const recordingStatus = ref<'idle' | 'connecting' | 'recording' | 'paused' | 'error'>('idle')
const isPaused = ref(false)
const transcriptRef = ref<HTMLElement>()
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
	const debugDrawerVisible = ref(false)
	const settingsDrawerVisible = ref(false)
	const transcriptSegmentOrder = ref<'asc' | 'desc'>('desc')
	const rebuildingTranscriptSegments = ref(false)
	const realtimeCollapsed = ref(false)
	const isNarrow = ref(false)
	const activePane = ref<'segments' | 'analysis'>('segments')
	const actionBarEnabled = computed(() => true)
	const actionBarRef = ref<{ openHelp: () => void } | null>(null)
	const promptDialogVisible = ref(false)
	const selectedPromptTemplateId = ref<string>('')
	const lastAutoAnalysisKey = ref('')
		const transcriptStreamStore = useTranscriptStreamStore()
		const transcriptEventSegmentationStore = useTranscriptEventSegmentationStore()

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

	  if (key === 'p') {
	    event.preventDefault()
	    promptDialogVisible.value = true
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
const statusText = computed(() => {
  if (!currentAnalysis.value) return ''
  const statusMap: Record<string, string> = {
    pending: '等待中',
    processing: '处理中',
    completed: '已完成',
    failed: '失败',
  }
  return statusMap[currentAnalysis.value.status] || currentAnalysis.value.status
})

const isSessionEnded = computed(() => {
  if (sessionEndedOverride.value) return true
  if (!sessionInfo.value) return false
  return !sessionInfo.value.isActive
})

const promptTemplates = computed(() => settings.value.promptTemplates || [])
const selectedPromptTemplate = computed(() => {
  const list = promptTemplates.value
  if (!list.length) return null
  return list.find(t => t.id === selectedPromptTemplateId.value) || list[0]
})

watch(
  promptTemplates,
  (list) => {
    if (selectedPromptTemplateId.value) return
    if (!list.length) return
    selectedPromptTemplateId.value = list[0].id
  },
  { immediate: true },
)

watch(
  () => settings.value.activePromptTemplateId,
  (next) => {
    const candidate = typeof next === 'string' ? next.trim() : ''
    if (!candidate) return
    if (candidate === selectedPromptTemplateId.value) return
    selectedPromptTemplateId.value = candidate
  },
  { immediate: true },
)

watch(
  () => settings.value.defaultPromptTemplateId,
  (next) => {
    if (selectedPromptTemplateId.value) return
    const candidate = typeof next === 'string' ? next.trim() : ''
    if (!candidate) return
    selectedPromptTemplateId.value = candidate
  },
  { immediate: true },
)

watch(selectedPromptTemplateId, (nextId) => {
  const normalized = typeof nextId === 'string' ? nextId.trim() : ''
  if (!normalized) return
  updateSettings({ activePromptTemplateId: normalized })
})

const recordingTag = computed(() => {
  if (isSessionEnded.value) return { type: 'info' as const, text: '会话已结束' }
  if (recordingStatus.value === 'recording') return { type: 'success' as const, text: '录制中' }
  if (recordingStatus.value === 'paused') return { type: 'warning' as const, text: '已静音' }
  if (recordingStatus.value === 'connecting') return { type: 'warning' as const, text: '连接中' }
  if (recordingStatus.value === 'error') return { type: 'danger' as const, text: '录音出错' }
  return { type: 'info' as const, text: '未录制' }
})

watch(
  [() => recordingStatus.value, () => speeches.value.length, () => selectedPromptTemplateId.value],
  () => {
    if (!sessionId.value) return
    if (recordingStatus.value !== 'idle' && recordingStatus.value !== 'error') return
    if (speeches.value.length === 0) return
    const tpl = selectedPromptTemplate.value
    if (!tpl) return

    const analysisType = buildPromptAnalysisType(tpl)
    const key = `${sessionId.value}:${analysisType}:${speeches.value.length}`
    if (key === lastAutoAnalysisKey.value) return
    lastAutoAnalysisKey.value = key
    void generateAnalysis()
  },
)

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
    focusedEventIndex.value = null
    highlightedRange.value = null
    realtimeStickToBottom.value = true
    currentAnalysis.value = null
    analysisLoading.value = false
    lastAutoAnalysisKey.value = ''

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
	  mediaQuery = window.matchMedia('(max-width: 960px)')
	  updateIsNarrow()
	  mediaQuery.addEventListener('change', updateIsNarrow)
	  window.addEventListener('keydown', handleGlobalKeydown, true)

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

// 选择发言
function selectSpeech(id: string) {
  selectedSpeechId.value = id
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

    // 读取 ASR 模型配置（优先使用设置面板值，回退到环境变量）
    const asrModel = (settings.value.asrModel || import.meta.env.VITE_ASR_MODEL || 'doubao') as
      | 'doubao'
      | 'glm'

    // 设置转写服务回调
    await transcription.start({
      sessionId: sessionId.value,
      model: asrModel,
      onTranscript: (transcript: Speech) => {
        const index = speeches.value.findIndex((item) => item.id === transcript.id)
        if (index >= 0) {
          speeches.value.splice(index, 1, transcript)
        } else {
          speeches.value.push(transcript)
        }
        scrollToBottom()
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

// 停止录音
function stopRecording() {
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

// 生成 AI 分析
async function generateAnalysis() {
  if (speeches.value.length === 0) {
    ElMessage.warning('请先开始录音并获取转写内容')
    return
  }

  const tpl = selectedPromptTemplate.value
  if (!tpl) {
    ElMessage.warning('请先选择提示词模板')
    return
  }

  const analysisType = buildPromptAnalysisType(tpl)

  analysisLoading.value = true
  try {
    const response = await analysisApi.getOrCreate({
      sessionId: sessionId.value,
      speechIds: speeches.value.map(s => s.id),
      analysisType,
      prompt: tpl.prompt,
    })
    currentAnalysis.value = response.data || null
    ElMessage.success('AI分析生成成功')
  } catch (error) {
    console.error('生成分析失败:', error)
    ElMessage.error('生成分析失败')
  } finally {
    analysisLoading.value = false
  }
}

function buildPromptAnalysisType(tpl: { id: string; updatedAt?: string }): string {
  const id = typeof tpl.id === 'string' ? tpl.id.trim() : ''
  const stamp = typeof tpl.updatedAt === 'string' ? tpl.updatedAt.trim() : ''
  return stamp ? `prompt:${id}@${stamp}` : `prompt:${id}`
}

// 复制分析
function copyAnalysis() {
  if (!currentAnalysis.value) return
  navigator.clipboard.writeText(currentAnalysis.value.result)
  ElMessage.success('已复制到剪贴板')
}

// 导出分析
function exportAnalysis(format: string | ExportFormat) {
  if (!currentAnalysis.value) {
    ElMessage.warning('请先生成分析')
    return
  }

  try {
    exportAnalysisService(currentAnalysis.value, {
      format: format as ExportFormat,
      includeTimestamp: true,
      includeMetadata: true,
    }, sessionInfo.value || undefined, speeches.value)

    const formatNames: Record<string, string> = {
      txt: '纯文本',
      md: 'Markdown',
      json: 'JSON',
    }
    ElMessage.success(`已导出为 ${formatNames[format]} 格式`)
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  }
}

// 渲染 Markdown（简单实现）
function renderMarkdown(text: string): string {
  return text
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/# (.*)/g, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/- (.*)/g, '<li>$1</li>')
    .replace(/\n/g, '<br>')
}

// 格式化时间
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

// 自动滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (transcriptRef.value) {
      transcriptRef.value.scrollTop = transcriptRef.value.scrollHeight
    }
  })
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
</script>

<style scoped>
.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.recording-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-color: rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(10px);
}

.recording-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.22);
}

.recording-tag.el-tag--success .recording-dot {
  background: var(--success-500);
  animation: pulse-ring 1.3s var(--ease-out) infinite;
}

.recording-tag.el-tag--warning .recording-dot {
  background: var(--warning-500);
}

.recording-tag.el-tag--danger .recording-dot {
  background: var(--danger-500);
}

.ghost-icon {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.55);
  color: var(--ink-700);
}

.ws-tag {
  max-width: 46vw;
}

.analysis-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-preview {
  margin-top: 12px;
}

.prompt-preview-title {
  font-size: 12px;
  color: var(--ink-500);
  margin-bottom: 6px;
}

.prompt-preview-body {
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(15, 23, 42, 0.04);
  color: var(--ink-700);
  font-size: 12px;
  line-height: 1.6;
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.ghost-button {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.55);
}

.settings-trigger {
  border-color: rgba(31, 41, 55, 0.18);
  color: #4b5563;
}

.settings-trigger:hover {
  background: rgba(24, 144, 255, 0.06);
  border-color: rgba(24, 144, 255, 0.40);
  color: #185abc;
}

.debug-trigger {
  border-color: #f2a661;
  color: #b45a12;
  background: #fff4e5;
}

.debug-trigger:hover {
  border-color: #ef8e38;
  color: #8a420d;
  background: #ffe4c6;
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
  height: 54px;
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
}

.realtime-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-size: 13px;
}

.realtime-stream-scroll {
  padding: 10px 16px;
  overflow-y: auto;
  height: 100%;
}

.realtime-event-item {
  display: inline;
  font-size: 13px;
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

/* 下部内容区域（左右分栏） */
.content-area {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
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
  overflow: hidden;
}

.transcript-content {
  flex: 1;
  overflow: hidden;
}

/* 分析面板 */
.analysis-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

/* 转写列表 */
.transcript-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.speech-item {
  padding: 12px;
  margin-bottom: 12px;
  border-left: 4px solid;
  background-color: #f9f9f9;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.speech-item:hover {
  background-color: #f0f0f0;
}

.speech-item.selected {
  background-color: #e6f7ff;
}

.speech-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.speaker-name {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #fff;
}

.speech-time {
  font-size: 12px;
  color: #999;
}

.mark-badge {
  padding: 2px 6px;
  background-color: #faad14;
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
}

.edited-badge {
  margin-top: 4px;
  font-size: 11px;
  color: #52c41a;
}

.speech-content {
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* 分析内容 */
.analysis-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.analysis-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.analysis-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.analysis-meta {
  display: flex;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.10);
  font-size: 12px;
  color: var(--ink-500);
  flex-wrap: wrap;
}

.analysis-text {
  flex: 1;
  padding: 16px;
  line-height: 1.8;
  color: var(--ink-700);
  white-space: pre-wrap;
  overflow-y: auto;
}

.analysis-text :deep(h1),
.analysis-text :deep(h2),
.analysis-text :deep(h3) {
  margin-top: 16px;
  margin-bottom: 8px;
}

.analysis-text :deep(li) {
  margin-left: 20px;
}

.analysis-actions {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid rgba(15, 23, 42, 0.10);
  gap: 8px;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition:
    opacity 220ms var(--ease-out),
    transform 220ms var(--ease-out);
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* 响应式 */
@media (max-width: 768px) {
  .realtime-transcript-bar {
    height: 190px;
  }
}
</style>
