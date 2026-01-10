<template>
  <div class="transcript-display">
    <div class="panel-header">
      <h2>实时转写</h2>
      <el-button-group size="small">
        <el-button @click="handleRefresh">刷新</el-button>
        <el-button @click="handleClear">清空</el-button>
      </el-button-group>
    </div>

    <div ref="transcriptRef" class="transcript-list" @scroll="handleScroll">
      <div
        v-for="speech in displaySpeeches"
        :key="speech.id"
        :class="['speech-item', { selected: speech.id === selectedSpeechId }]"
        :style="{ borderLeftColor: speech.speakerColor }"
        @click="handleSelectSpeech(speech.id)"
      >
        <div class="speech-header">
          <span
            class="speaker-name"
            :style="{ backgroundColor: speech.speakerColor || '#1890ff' }"
          >
            {{ speech.speakerName }}
          </span>
          <span class="speech-time">{{ formatTime(speech.startTime) }}</span>
          <span v-if="speech.isMarked" class="mark-badge">已标记</span>
          <span
            v-if="speech.confidence !== undefined"
            class="confidence-badge"
            :class="getConfidenceClass(speech.confidence)"
            :title="`置信度: ${(speech.confidence * 100).toFixed(1)}%`"
          >
            置信度: {{ (speech.confidence * 100).toFixed(0) }}%
          </span>
        </div>

        <div
          v-if="editingId === speech.id"
          class="speech-edit-container"
        >
          <el-input
            v-model="editContent"
            type="textarea"
            :rows="3"
            placeholder="编辑转写内容"
            @blur="handleEditCancel"
            @keyup.enter.ctrl="handleEditSave(speech.id)"
          />
          <div class="edit-actions">
            <el-button size="small" @click="handleEditCancel">取消</el-button>
            <el-button size="small" type="primary" @click="handleEditSave(speech.id)">
              保存 (Ctrl+Enter)
            </el-button>
          </div>
        </div>

        <div v-else class="speech-content">
          {{ speech.content }}
        </div>

        <div v-if="speech.isEdited && editingId !== speech.id" class="edited-badge">
          已编辑
        </div>

        <div class="speech-actions">
          <el-button
            v-if="editingId !== speech.id"
            size="small"
            text
            @click.stop="handleEditStart(speech)"
          >
            编辑
          </el-button>
          <el-button
            size="small"
            text
            :type="speech.isMarked ? 'warning' : 'default'"
            @click.stop="handleToggleMark(speech)"
          >
            {{ speech.isMarked ? '取消标记' : '标记' }}
          </el-button>
        </div>
      </div>

      <div v-if="displaySpeeches.length === 0" class="empty-state">
        <el-empty description="暂无转写内容，点击右上角开始录音" />
      </div>
    </div>

    <div v-if="!autoScrollEnabled" class="scroll-hint">
      <el-button size="small" @click="scrollToBottom">
        <el-icon><Bottom /></el-icon>
        回到底部
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Bottom } from '@element-plus/icons-vue'
import type { Speech } from '@/services/api'

const props = withDefaults(
  defineProps<{
    speeches: Speech[]
    autoScroll?: boolean
  }>(),
  {
    autoScroll: true,
  },
)

const emit = defineEmits<{
  (event: 'refresh'): void
  (event: 'clear'): void
  (event: 'select', id: string): void
  (event: 'update:speech', speech: Speech): void
  (event: 'toggle-mark', speech: Speech): void
}>()

const transcriptRef = ref<HTMLElement>()
const selectedSpeechId = ref<string>('')
const editingId = ref<string>('')
const editContent = ref('')
const autoScrollEnabled = ref(props.autoScroll)
const isUserScrolling = ref(false)

/**
 * 显示的发言记录（用于过滤或排序）
 */
const displaySpeeches = computed(() => props.speeches)

/**
 * 格式化时间
 */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

/**
 * 获取置信度样式类
 */
function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.9) return 'confidence-high'
  if (confidence >= 0.7) return 'confidence-medium'
  return 'confidence-low'
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  nextTick(() => {
    if (transcriptRef.value) {
      transcriptRef.value.scrollTop = transcriptRef.value.scrollHeight
      autoScrollEnabled.value = true
    }
  })
}

/**
 * 处理滚动事件
 */
function handleScroll(event: Event) {
  const target = event.target as HTMLElement
  const { scrollTop, scrollHeight, clientHeight } = target
  const distanceToBottom = scrollHeight - scrollTop - clientHeight

  // 如果距离底部超过 100px，认为用户在手动滚动
  if (distanceToBottom > 100) {
    isUserScrolling.value = true
    autoScrollEnabled.value = false
  } else if (distanceToBottom < 10) {
    isUserScrolling.value = false
    autoScrollEnabled.value = true
  }
}

/**
 * 处理刷新
 */
function handleRefresh() {
  emit('refresh')
}

/**
 * 处理清空
 */
function handleClear() {
  emit('clear')
}

/**
 * 处理选择发言
 */
function handleSelectSpeech(id: string) {
  selectedSpeechId.value = id
  emit('select', id)
}

/**
 * 开始编辑
 */
function handleEditStart(speech: Speech) {
  editingId.value = speech.id
  editContent.value = speech.content
  nextTick(() => {
    const textarea = document.querySelector('.speech-edit-container textarea') as HTMLTextAreaElement
    textarea?.focus()
  })
}

/**
 * 取消编辑
 */
function handleEditCancel() {
  editingId.value = ''
  editContent.value = ''
}

/**
 * 保存编辑
 */
function handleEditSave(id: string) {
  const speech = props.speeches.find(s => s.id === id)
  if (!speech) return

  const updatedSpeech = {
    ...speech,
    content: editContent.value,
    isEdited: true,
  }

  emit('update:speech', updatedSpeech)
  editingId.value = ''
  editContent.value = ''
}

/**
 * 切换标记状态
 */
function handleToggleMark(speech: Speech) {
  emit('toggle-mark', {
    ...speech,
    isMarked: !speech.isMarked,
  })
}

/**
 * 监听发言记录变化，自动滚动到底部
 */
watch(
  () => props.speeches.length,
  (newLength, oldLength) => {
    if (newLength > oldLength && autoScrollEnabled.value && !isUserScrolling.value) {
      scrollToBottom()
    }
  },
)

/**
 * 监听 autoScroll 属性变化
 */
watch(
  () => props.autoScroll,
  (value) => {
    autoScrollEnabled.value = value
    if (value) {
      scrollToBottom()
    }
  },
)

// 导出方法供父组件调用
defineExpose({
  scrollToBottom,
})
</script>

<style scoped>
.transcript-display {
  display: flex;
  flex-direction: column;
  height: 100%;
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
  flex-shrink: 0;
}

.panel-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

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

.speech-item:hover .speech-actions {
  opacity: 1;
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
  font-weight: 500;
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

/* 置信度样式 */
.confidence-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.confidence-badge.confidence-high {
  background-color: #52c41a;
  color: #fff;
}

.confidence-badge.confidence-medium {
  background-color: #faad14;
  color: #fff;
}

.confidence-badge.confidence-low {
  background-color: #ff4d4f;
  color: #fff;
}

.speech-content {
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
}

.speech-edit-container {
  margin: 8px 0;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.edited-badge {
  margin-top: 4px;
  font-size: 11px;
  color: #52c41a;
}

.speech-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.speech-item:hover .speech-actions {
  opacity: 1;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.scroll-hint {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
}

.transcript-list {
  position: relative;
}

/* 响应式 */
@media (max-width: 768px) {
  .panel-header {
    padding: 8px 12px;
  }

  .transcript-list {
    padding: 12px;
  }

  .speech-item {
    padding: 10px;
  }
}
</style>
