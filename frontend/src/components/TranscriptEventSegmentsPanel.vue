<template>
  <div ref="panelRef" class="event-segments-panel" v-loading="loading">
    <div v-if="!loading && segments.length === 0" class="empty">
      <el-empty description="暂无语句拆分结果" />
    </div>

    <div v-else class="segment-list">
      <button v-if="progressBadge" type="button" class="segment-item progress-item" disabled>
        <div class="segment-header">
          <span class="segment-seq">
          #{{ progressBadge.sequenceText }}
{{ progressBadge.title }}

          </span>
          <span class="segment-range">
            {{ progressBadge.rangeText }}
            {{ progressBadge.meta }}
          </span>
        </div>
        <div class="segment-content">
          <div class="progress-copy">
            <span class="progress-title"></span>
           
          </div>

          <div v-if="progressBadge.percent != null" class="progress-bar" aria-hidden="true">
            <div class="progress-bar-fill" :style="{ width: `${progressBadge.percent}%` }" />
          </div>

          
        </div>
      </button>
      <button v-if="progressErrorBadge" type="button" class="segment-item error-item" disabled>
        <div class="segment-header">
          <span class="segment-seq">#{{ progressErrorBadge.sequenceText }}</span>
          <span class="segment-range">
            {{ progressErrorBadge.rangeText }}
          </span>
        </div>
        <div class="segment-content">{{ progressErrorBadge.content }}</div>
      </button>
      <button
        v-for="segment in orderedSegments"
        :key="segment.id || segment.sequence"
        type="button"
        class="segment-item"
        @click="
          emit('select-range', {
            start: getDisplayStartIndex(segment),
            end: getDisplayEndIndex(segment),
            startOffset: segment.sourceStartEventOffset,
            endOffset: segment.sourceEndEventOffset,
          })
        "
      >
        <div class="segment-header">
          <span class="segment-seq">#{{ segment.sequence }}</span>
          <span class="segment-range">
            事件 #{{ getDisplayStartIndex(segment) }}-#{{ getDisplayEndIndex(segment) }}
          </span>
        </div>
        <div class="segment-content">{{ segment.content }}</div>
      </button>
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

const emit = defineEmits<{
  (e: 'select-range', payload: { start: number; end: number; startOffset?: number; endOffset?: number }): void
}>()

const panelRef = ref<HTMLElement | null>(null)
const loading = computed(() => props.loading === true)

const normalizedOrder = computed(() => (props.order === 'asc' ? 'asc' : 'desc'))

const orderedSegments = computed(() => {
  const sorted = [...props.segments].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))
  return normalizedOrder.value === 'asc' ? sorted.slice().reverse() : sorted
})

function getDisplayStartIndex(segment: TranscriptEventSegment): number {
  return segment.sourceStartEventIndexExact ?? segment.sourceStartEventIndex
}

function getDisplayEndIndex(segment: TranscriptEventSegment): number {
  return segment.sourceEndEventIndexExact ?? segment.sourceEndEventIndex
}

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
  const percent = getProgressPercent(progress)
  const percentText = percent == null ? '' : ` · ${percent}%`
  return {
    sequenceText: progress.sequence != null ? progress.sequence : modeText,
    rangeText,
    title: `${modeText}拆分中1`,
    meta: `${getStageText(progress.stage)}${percentText}${modelText}${messageText}`,
    percent,
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

function getProgressPercent(progress: TranscriptEventSegmentationProgressData): number | null {
  const maxIndex = typeof progress.maxEventIndex === 'number' ? progress.maxEventIndex : null
  const pointer = typeof progress.pointerEventIndex === 'number' ? progress.pointerEventIndex : null
  if (maxIndex == null || pointer == null) return null
  if (!Number.isFinite(maxIndex) || !Number.isFinite(pointer)) return null
  if (maxIndex <= 0) return null
  const clamped = Math.min(maxIndex, Math.max(0, pointer))
  return Math.min(100, Math.max(0, Math.round((clamped / maxIndex) * 100)))
}

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
  appearance: none;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid rgba(15, 23, 42, 0.10);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.64);
  cursor: pointer;
  transition:
    transform 200ms var(--ease-out),
    box-shadow 200ms var(--ease-out),
    border-color 200ms var(--ease-out);
}

.segment-item:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-2);
  border-color: rgba(47, 107, 255, 0.22);
}

.segment-item:disabled {
  cursor: default;
  opacity: 0.92;
}

.progress-item {
  border-style: dashed;
  background: rgba(217, 119, 6, 0.10);
}

.progress-copy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.progress-title {
  font-weight: 700;
  color: var(--ink-900);
}

.progress-meta {
  font-size: 12px;
  color: var(--ink-500);
  text-align: right;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.08);
  margin-bottom: 10px;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgba(47, 107, 255, 0.25), rgba(47, 107, 255, 0.58), rgba(47, 107, 255, 0.25));
  background-size: 220% 100%;
  animation: shimmer 1.3s linear infinite;
}

.skeleton {
  display: grid;
  gap: 8px;
}

.skeleton-line {
  height: 10px;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.12), rgba(15, 23, 42, 0.06));
  background-size: 240% 100%;
  animation: shimmer 1.2s linear infinite;
}

.w-92 {
  width: 92%;
}

.w-68 {
  width: 68%;
}

.error-item {
  border-color: rgba(220, 38, 38, 0.20);
  background: rgba(220, 38, 38, 0.08);
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
  color: var(--ink-500);
}

.segment-range {
  font-size: 12px;
  color: var(--ink-500);
}

.segment-content {
  white-space: pre-wrap;
  line-height: 1.5;
  color: var(--ink-900);
}
</style>
