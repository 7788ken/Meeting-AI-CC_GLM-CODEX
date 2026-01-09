<template>
  <div class="meeting-container">
    <!-- 顶部栏 -->
    <header class="meeting-header">
      <div class="header-left">
        <el-button size="small" class="back-button" @click="router.push('/')">← 返回</el-button>
        <h1 class="app-title">AI会议助手</h1>
        <el-tag v-if="meetingStore.currentSession" type="success" size="small">
          会话进行中
        </el-tag>
      </div>
      <div class="header-right">
        <el-select
          v-model="selectedModel"
          placeholder="选择AI模型"
          size="small"
          style="width: 120px; margin-right: 12px"
        >
          <el-option
            v-for="model in AI_MODELS"
            :key="model.value"
            :label="model.label"
            :value="model.value"
          />
        </el-select>
        <el-button
          :type="meetingStore.isRecording ? 'danger' : 'primary'"
          :icon="meetingStore.isRecording ? 'VideoPause' : 'VideoPlay'"
          size="small"
          @click="toggleRecording"
        >
          {{ meetingStore.isRecording ? '停止录音' : '开始录音' }}
        </el-button>
        <el-button size="small" @click="router.push('/settings')">设置</el-button>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="meeting-main">
      <!-- 左侧：转写显示区 -->
      <section class="transcript-panel">
        <div class="panel-header">
          <h2>实时转写</h2>
          <el-button-group size="small">
            <el-button @click="meetingStore.clearSession">清空</el-button>
          </el-button-group>
        </div>
        <div ref="transcriptRef" class="transcript-list">
          <div
            v-for="speech in meetingStore.activeSpeeches"
            :key="speech.id"
            :class="[
              'speech-item',
              { selected: speech.id === meetingStore.selectedSpeechId },
            ]"
            :style="{ borderColor: getSpeakerColor(speech.speakerId) }"
            @click="selectSpeech(speech.id)"
          >
            <div class="speech-header">
              <span
                class="speaker-name"
                :style="{ backgroundColor: getSpeakerColor(speech.speakerId) }"
              >
                {{ speech.speakerName }}
              </span>
              <span class="speech-time">{{ formatTime(speech.startTime) }}</span>
            </div>
            <div class="speech-content">{{ speech.content }}</div>
          </div>
          <div v-if="meetingStore.activeSpeeches.length === 0" class="empty-state">
            <el-empty description="暂无转写内容，点击右上角开始录音" />
          </div>
        </div>
      </section>

      <!-- 右侧：AI分析区 -->
      <section class="analysis-panel">
        <div class="panel-header">
          <h2>AI分析</h2>
        </div>
        <div class="analysis-content">
          <template v-if="meetingStore.selectedAnalysis">
            <el-tabs v-model="activeTab" type="border-card">
              <el-tab-pane label="核心要点" name="core">
                <div class="analysis-text">
                  {{ meetingStore.selectedAnalysis.coreAnalysis }}
                </div>
              </el-tab-pane>
              <el-tab-pane label="简要回答" name="brief">
                <div class="analysis-text">
                  {{ meetingStore.selectedAnalysis.briefAnswer }}
                </div>
              </el-tab-pane>
              <el-tab-pane label="深度分析" name="deep">
                <div class="analysis-text">
                  {{ meetingStore.selectedAnalysis.deepAnswer }}
                </div>
              </el-tab-pane>
            </el-tabs>
            <div class="analysis-actions">
              <el-button size="small" @click="copyAnalysis">复制</el-button>
              <el-button size="small" type="primary" @click="regenerateAnalysis">
                重新生成
              </el-button>
            </div>
          </template>
          <template v-else>
            <div class="empty-state">
              <el-empty description="点击左侧发言查看AI分析" />
            </div>
          </template>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useMeetingStore } from '@/stores/meeting'
import { AI_MODELS } from '@/types'
import type { Speech } from '@/stores/meeting'

const router = useRouter()
const meetingStore = useMeetingStore()

// 状态
const selectedModel = ref<string>('qianwen')
const activeTab = ref<string>('core')
const transcriptRef = ref<HTMLElement>()

// 发言者颜色映射
const speakerColors = new Map<string, string>()
function getSpeakerColor(speakerId: string): string {
  if (!speakerColors.has(speakerId)) {
    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2']
    const colorIndex = speakerColors.size % colors.length
    speakerColors.set(speakerId, colors[colorIndex])
  }
  return speakerColors.get(speakerId)!
}

// 格式化时间
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

// 选择发言
function selectSpeech(id: string) {
  meetingStore.selectSpeech(id)
  generateAnalysis(id)
}

// 生成AI分析
async function generateAnalysis(speechId: string) {
  // TODO: 调用后端API生成分析
  ElMessage.info('AI分析功能开发中...')
}

// 复制分析
function copyAnalysis() {
  if (!meetingStore.selectedAnalysis) return

  const text =
    activeTab.value === 'core'
      ? meetingStore.selectedAnalysis.coreAnalysis
      : activeTab.value === 'brief'
        ? meetingStore.selectedAnalysis.briefAnswer
        : meetingStore.selectedAnalysis.deepAnswer

  navigator.clipboard.writeText(text)
  ElMessage.success('已复制到剪贴板')
}

// 重新生成分析
function regenerateAnalysis() {
  if (meetingStore.selectedSpeechId) {
    generateAnalysis(meetingStore.selectedSpeechId)
  }
}

// 切换录音
async function toggleRecording() {
  if (meetingStore.isRecording) {
    // 停止录音
    meetingStore.isRecording = false
    meetingStore.endSession()
    ElMessage.info('录音已停止')
  } else {
    // 开始录音
    try {
      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())

      meetingStore.createSession()
      meetingStore.isRecording = true
      ElMessage.success('录音已开始')

      // TODO: 连接WebSocket开始实时转写
    } catch (error) {
      ElMessage.error('无法访问麦克风，请检查权限设置')
    }
  }
}

// 自动滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (transcriptRef.value) {
      transcriptRef.value.scrollTop = transcriptRef.value.scrollHeight
    }
  })
}

onMounted(() => {
  // 初始化
})

onUnmounted(() => {
  // 清理
})
</script>

<style scoped>
.meeting-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f5f5;
}

/* 顶部栏 */
.meeting-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background-color: #fff;
  border-bottom: 1px solid #e8e8e8;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1890ff;
}

.header-right {
  display: flex;
  align-items: center;
}

.back-button {
  padding: 0 8px;
}

/* 主内容区 */
.meeting-main {
  display: flex;
  flex: 1;
  overflow: hidden;
  padding: 16px;
  gap: 16px;
}

/* 转写面板 */
.transcript-panel {
  flex: 6;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  border-radius: 8px;
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

.speech-content {
  line-height: 1.6;
  color: #333;
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

.analysis-text {
  padding: 16px;
  line-height: 1.8;
  color: #333;
  white-space: pre-wrap;
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
  .meeting-main {
    flex-direction: column;
  }

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
