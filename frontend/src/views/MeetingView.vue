<template>
  <MainLayout>
    <template #header>
      <AppHeader
        title="AI会议助手"
        :showBackButton="true"
        :status="sessionInfo?.isActive ? 'active' : 'ended'"
        @back="router.push('/')"
      />

      <div class="header-right">
        <el-select
          v-model="selectedAnalysisType"
          placeholder="分析类型"
          size="small"
          style="width: 120px; margin-right: 8px"
        >
          <el-option label="会议摘要" value="summary" />
          <el-option label="行动项" value="action-items" />
          <el-option label="情感分析" value="sentiment" />
          <el-option label="关键词" value="keywords" />
          <el-option label="议题分析" value="topics" />
        </el-select>

        <el-button
          size="small"
          type="danger"
          :loading="endingSession"
          :disabled="!sessionId || isSessionEnded"
          @click="endSession"
        >
          结束会话
        </el-button>

        <RecordButton
          :status="recordingStatus"
          :isPaused="isPaused"
          :disabled="isSessionEnded"
          disabledText="会话已结束"
          @toggle="toggleRecording"
          @pause="pauseRecording"
        />

        <el-tag v-if="wsReconnectTag" :type="wsReconnectTag.type" size="small">
          {{ wsReconnectTag.text }}
        </el-tag>

        <el-button size="small" type="success" @click="generateAnalysis">生成分析</el-button>

        <el-tooltip content="设置" placement="bottom">
          <el-button
            size="small"
            circle
            class="settings-trigger"
            @click="settingsDrawerVisible = true"
          >
            <el-icon><Setting /></el-icon>
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
    <section class="realtime-transcript-bar">
      <div class="realtime-header">
        <h3>原文流</h3>
        <div class="realtime-status">
          <el-tag v-if="recordingStatus === 'recording'" type="success" size="small">录制中</el-tag>
          <el-tag v-else-if="recordingStatus === 'paused'" type="warning" size="small">已暂停</el-tag>
          <el-tag v-else type="info" size="small">未录制</el-tag>
          <el-tag type="info" size="small">事件数: {{ transcriptStreamStore.events.length }}</el-tag>
        </div>
      </div>
      <div class="realtime-content">
        <div v-if="transcriptStreamStore.events.length === 0" class="realtime-placeholder">
          暂无实时转写内容
        </div>
        <div v-else class="realtime-events-scroll">
          <div
            v-for="event in transcriptStreamStore.events.slice().reverse()"
            :key="event.eventIndex"
            class="realtime-event-item"
          >
            <div class="event-meta-row">
              <span class="event-index">事件#{{ event.eventIndex }}</span>
              <span
                v-if="event.isFinal && getEventDurationText(event.eventIndex)"
                class="event-duration"
              >
                {{ getEventDurationText(event.eventIndex) }}
              </span>
              <span v-if="event.isFinal" class="event-final">final</span>
            </div>
            <div class="event-text">{{ event.content }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 下部：左右分栏 -->
    <div class="content-area">
      <!-- 下左：GLM 拆分后的独立发言 -->
	      <section class="transcript-panel">
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
        />
      </div>
    </section>

    <!-- 右侧：AI分析区 -->
    <section class="analysis-panel">
      <div class="panel-header">
        <h2>AI分析</h2>
        <el-tag v-if="currentAnalysis?.isCached" type="info" size="small">缓存</el-tag>
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
          <el-empty description="选择发言记录后点击「生成分析」" />
        </div>
      </div>
    </section>
    </div>

    <SettingsDrawer v-model="settingsDrawerVisible" />
    <DebugDrawer v-model="debugDrawerVisible" :session-id="sessionId" />
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
import type { ConnectionStatus } from '@/services/websocket'
import { useTranscriptStreamStore } from '@/stores/transcriptStream'
import { useTranscriptEventSegmentationStore } from '@/stores/transcriptEventSegmentation'
import { useAppSettings } from '@/composables/useAppSettings'
import MainLayout from '@/components/MainLayout.vue'
import AppHeader from '@/components/AppHeader.vue'
import RecordButton from '@/components/RecordButton.vue'
import TranscriptEventSegmentsPanel from '@/components/TranscriptEventSegmentsPanel.vue'
import DebugDrawer from '@/components/DebugDrawer.vue'
import SettingsDrawer from '@/components/SettingsDrawer.vue'

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
const selectedAnalysisType = ref<string>(settings.value.analysisType || 'summary')
const transcriptRef = ref<HTMLElement>()
const endingSession = ref(false)
const sessionEndedOverride = ref(false)
const wsConnectionStatus = ref<ConnectionStatus | null>(null)
	const debugDrawerVisible = ref(false)
	const settingsDrawerVisible = ref(false)
	const transcriptSegmentOrder = ref<'asc' | 'desc'>('desc')
	const rebuildingTranscriptSegments = ref(false)
	const transcriptStreamStore = useTranscriptStreamStore()
	const transcriptEventSegmentationStore = useTranscriptEventSegmentationStore()

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

watch(selectedAnalysisType, (nextType) => {
  updateSettings({ analysisType: nextType as any })
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

let hasInitializedSession = false

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

    if (!sessionId.value) return

    // 重新绑定 WebSocket（reset 会解绑，需要重新绑定）
    transcriptStreamStore.bindWebSocket()
    transcriptEventSegmentationStore.bindWebSocket()

    await loadSession()
    await loadSpeeches()
    await transcriptStreamStore.loadSnapshot(sessionId.value)
    await transcriptEventSegmentationStore.loadSnapshot(sessionId.value)
  },
  { immediate: true },
)

// 初始化
onMounted(async () => {
  sessionId.value = route.params.id as string || route.query.id as string || ''
  if (sessionId.value) {
    await loadSession()
    await loadSpeeches()
    transcriptStreamStore.bindWebSocket()
    await transcriptStreamStore.loadSnapshot(sessionId.value)
    transcriptEventSegmentationStore.bindWebSocket()
    await transcriptEventSegmentationStore.loadSnapshot(sessionId.value)
  }
})

onUnmounted(() => {
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
	    transcriptEventSegmentationStore.clearSegments()
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

  analysisLoading.value = true
  try {
    const response = await analysisApi.getOrCreate({
      sessionId: sessionId.value,
      speechIds: speeches.value.map(s => s.id),
      analysisType: selectedAnalysisType.value as any,
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
  gap: 8px;
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
  height:200px;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.realtime-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid #e8e8e8;
  background-color: #fafafa;
}

.realtime-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.realtime-status {
  display: flex;
  gap: 8px;
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

.realtime-events-scroll {
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  padding: 8px 16px;
  overflow-y: auto;
  height: 100%;
}

.realtime-event-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background-color: #f9f9f9;
  border-radius: 6px;
  font-size: 13px;
}

.event-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-index {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background-color: #e6f4ff;
  color: #1677ff;
  font-size: 12px;
  font-weight: 500;
}

.event-text {
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.event-final {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  background-color: #e6f4ff;
  color: #1677ff;
  font-size: 11px;
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

/* 下部内容区域（左右分栏） */
.content-area {
  flex: 1;
  display: flex;
  gap: 16px;
  overflow: hidden;
}

/* 转写面板 */
.transcript-panel {
  flex: 4;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.transcript-content {
  flex: 1;
  overflow: hidden;
}

/* 分析面板 */
.analysis-panel {
  flex: 4;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e8e8e8;
}

.panel-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
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
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #e8e8e8;
  font-size: 12px;
  color: #999;
}

.analysis-text {
  flex: 1;
  padding: 16px;
  line-height: 1.8;
  color: #333;
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
  border-top: 1px solid #e8e8e8;
  gap: 8px;
}

/* 响应式 */
@media (max-width: 768px) {
  .transcript-panel,
  .analysis-panel {
    flex: none;
    height: 50%;
  }

  .header-right .el-select {
    display: none;
  }
}
</style>
