<template>
  <div ref="panelRef" class="event-segments-panel" v-loading="loading">
    <div v-if="!loading && segments.length === 0" class="empty">
      <el-empty description="暂无语句拆分结果" />
    </div>

    <div v-else class="segment-list">
      <div v-if="progressBadge" class="segment-item progress-item">
        <div class="segment-header">
          <span class="segment-seq">#{{ progressBadge.sequenceText }}</span>
          <span class="segment-range">
            {{ progressBadge.rangeText }}
          </span>
        </div>
        <div class="segment-content">{{ progressBadge.content }}</div>
      </div>
      <div v-if="progressErrorBadge" class="segment-item error-item">
        <div class="segment-header">
          <span class="segment-seq">#{{ progressErrorBadge.sequenceText }}</span>
          <span class="segment-range">
            {{ progressErrorBadge.rangeText }}
          </span>
        </div>
        <div class="segment-content">{{ progressErrorBadge.content }}</div>
      </div>
      <div v-for="segment in orderedSegments" :key="segment.id || segment.sequence" class="segment-item">
        <div class="segment-header">
          <span class="segment-seq">#{{ segment.sequence }}</span>
          <span class="segment-range">
            事件 #{{ segment.sourceStartEventIndex }}-#{{ segment.sourceEndEventIndex }}
          </span>
        </div>
        <div class="segment-content">{{ segment.content }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { TranscriptEventSegment } from '@/services/api'
import type { TranscriptEventSegmentationProgressData } from '@/services/websocket'

const props = defineProps<{
  segments: TranscriptEventSegment[]
  order?: 'asc' | 'desc'
  loading?: boolean
  progress?: TranscriptEventSegmentationProgressData | null
}>()

const panelRef = ref<HTMLElement | null>(null)
const loading = computed(() => props.loading === true)

const normalizedOrder = computed(() => (props.order === 'asc' ? 'asc' : 'desc'))

const orderedSegments = computed(() => {
  const sorted = [...props.segments].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))
  return normalizedOrder.value === 'asc' ? sorted.slice().reverse() : sorted
})

function isInFlightStage(stage: TranscriptEventSegmentationProgressData['stage']): boolean {
  return stage === 'queued' || stage === 'calling_llm' || stage === 'parsing' || stage === 'persisting'
}

function getStageText(stage: TranscriptEventSegmentationProgressData['stage']): string {
  const map: Record<string, string> = {
    queued: '排队中',
    calling_llm: '调用中',
    parsing: '解析中',
    persisting: '落库中',
    completed: '已完成',
    failed: '失败',
  }
  return map[stage] || stage
}

const progressBadge = computed(() => {
  const progress = props.progress
  if (!progress) return null
  if (!isInFlightStage(progress.stage)) return null

  const rangeText = `事件 #${progress.windowStartEventIndex}-#${progress.windowEndEventIndex}`
  const modelText = progress.model ? ` · ${progress.model}` : ''
  const messageText = progress.message ? ` · ${progress.message}` : ''
  const modeText = progress.mode === 'rebuild' ? '重拆' : '增量'
  return {
    sequenceText: progress.sequence != null ? progress.sequence : modeText,
    rangeText,
    content: `${modeText}拆分中 · ${getStageText(progress.stage)}${modelText}${messageText}`,
  }
})

const progressErrorBadge = computed(() => {
  const progress = props.progress
  if (!progress) return null
  if (progress.stage !== 'failed') return null
  const rangeText = `事件 #${progress.windowStartEventIndex}-#${progress.windowEndEventIndex}`
  const modelText = progress.model ? ` · ${progress.model}` : ''
  const messageText = progress.message ? ` · ${progress.message}` : ''
  const modeText = progress.mode === 'rebuild' ? '重拆' : '增量'
  return {
    sequenceText: progress.sequence != null ? progress.sequence : modeText,
    rangeText,
    content: `${modeText}拆分失败${modelText}${messageText}`,
  }
})

const latestSequence = computed(() => {
  if (!props.segments.length) return null
  return props.segments.reduce((max, item) => Math.max(max, item.sequence ?? 0), 0)
})

async function scrollToLatest() {
  await nextTick()
  const el = panelRef.value
  if (!el) return
  if (normalizedOrder.value === 'desc') {
    el.scrollTop = 0
  } else {
    el.scrollTop = el.scrollHeight
  }
}

watch([latestSequence, normalizedOrder], ([nextSequence]) => {
  if (nextSequence == null) return
  scrollToLatest()
})
</script>

<style scoped>
.event-segments-panel {
  height: 100%;
  overflow: auto;
  padding: 0 8px;
}

.empty {
  padding: 16px 0;
}

.segment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.segment-item {
  padding: 10px 12px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fff;
}

.progress-item {
  border-style: dashed;
  background: #fffbe6;
}

.error-item {
  border-color: #ffccc7;
  background: #fff2f0;
}

.segment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.segment-seq {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  color: #666;
}

.segment-range {
  font-size: 12px;
  color: #999;
}

.segment-content {
  white-space: pre-wrap;
  line-height: 1.5;
  color: #111;
}
</style>
