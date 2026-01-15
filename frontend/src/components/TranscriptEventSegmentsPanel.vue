<template>
  <div ref="panelRef" class="event-segments-panel" v-loading="loading">
    <div v-if="!loading && segments.length === 0" class="empty">
      <el-empty description="暂无语句拆分结果" />
    </div>

    <div v-else class="segment-list">
      <div v-if="progressBadge" class="segment-item progress-item is-disabled" aria-disabled="true">
        <div class="segment-header">
          <span class="segment-seq">#{{ progressBadge.sequenceText }} {{ progressBadge.title }}</span>
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
      </div>
      <div v-if="progressErrorBadge" class="segment-item error-item is-disabled" aria-disabled="true">
        <div class="segment-header">
          <span class="segment-seq">#{{ progressErrorBadge.sequenceText }}</span>
          <span class="segment-range">
            {{ progressErrorBadge.rangeText }}
          </span>
        </div>
        <div class="segment-content">{{ progressErrorBadge.content }}</div>
      </div>
      <div
        v-for="segment in orderedSegments"
        :key="segment.id || segment.sequence"
        class="segment-item"
        :class="{ 'has-target-analysis': true, 'is-highlighted': isSegmentHighlighted(segment) }"
        role="button"
        tabindex="0"
        @click="handleSelect(segment)"
        @keydown="handleItemKeydown($event, segment)"
      >
        <div class="segment-header">
          <div class="segment-header-left">
            <span class="segment-seq">@{{ segment.sequence }} ｜
            <!-- 事件 范围 -->
              #{{ getDisplayStartIndex(segment) }}-#{{ getDisplayEndIndex(segment) }}
            </span>
          </div>
          <el-button
            size="small"
            class="target-analysis-btn"
            :icon="Search"
            @click="handleTargetAnalysis($event, segment)"
          >
            针对性分析
          </el-button>
        </div>
        <div class="segment-content">{{ getDisplayContent(segment) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import type { TranscriptEventSegment } from '@/services/api'
import type { TranscriptEventSegmentationProgressData } from '@/services/websocket'

const props = defineProps<{
  segments: TranscriptEventSegment[]
  order?: 'asc' | 'desc'
  loading?: boolean
  progress?: TranscriptEventSegmentationProgressData | null
  highlightedSegmentId?: string | null
  translationEnabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'select-range', payload: { start: number; end: number; startOffset?: number; endOffset?: number }): void
  (e: 'target-analysis', segment: TranscriptEventSegment): void
}>()

const panelRef = ref<HTMLElement | null>(null)
const loading = computed(() => props.loading === true)

const normalizedOrder = computed(() => (props.order === 'asc' ? 'asc' : 'desc'))

const orderedSegments = computed(() => {
  const sorted = [...props.segments].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))
  return normalizedOrder.value === 'asc' ? sorted.slice().reverse() : sorted
})

const isSegmentHighlighted = (segment: TranscriptEventSegment): boolean => {
  return segment.id === props.highlightedSegmentId
}

function getDisplayContent(segment: TranscriptEventSegment): string {
  const translationEnabled = props.translationEnabled === true
  if (!translationEnabled) return segment.content
  const translated = typeof segment.translatedContent === 'string' ? segment.translatedContent.trim() : ''
  return translated ? translated : segment.content
}

function getDisplayStartIndex(segment: TranscriptEventSegment): number {
  return segment.sourceStartEventIndexExact ?? segment.sourceStartEventIndex
}

function getDisplayEndIndex(segment: TranscriptEventSegment): number {
  return segment.sourceEndEventIndexExact ?? segment.sourceEndEventIndex
}

function handleSelect(segment: TranscriptEventSegment): void {
  emit('select-range', {
    start: getDisplayStartIndex(segment),
    end: getDisplayEndIndex(segment),
    startOffset: segment.sourceStartEventOffset,
    endOffset: segment.sourceEndEventOffset,
  })
}

function handleItemKeydown(event: KeyboardEvent, segment: TranscriptEventSegment): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    handleSelect(segment)
  }
}

function handleTargetAnalysis(event: Event, segment: TranscriptEventSegment): void {
  event.stopPropagation()
  emit('target-analysis', segment)
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

.segment-item:hover:not(.is-disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-2);
  border-color: rgba(47, 107, 255, 0.22);
}

.segment-item.is-disabled {
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

.segment-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

/* 针对性分析按钮 */
.target-analysis-btn {
  padding: 4px 10px;
  font-size: 12px;
  height: auto;
  border-radius: 6px;
  background: rgba(47, 107, 255, 0.08);
  border-color: rgba(47, 107, 255, 0.25);
  color: var(--brand-600);
  transition: all 0.2s var(--ease-out);
  flex-shrink: 0;
}

.target-analysis-btn:hover {
  background: rgba(47, 107, 255, 0.15);
  border-color: rgba(47, 107, 255, 0.40);
  color: var(--brand-700);
  transform: translateY(-1px);
}

.target-analysis-btn :deep(.el-icon) {
  font-size: 13px;
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.segment-content {
  white-space: pre-wrap;
  line-height: 1.5;
  color: var(--ink-900);
}

/* 高亮当前正在分析的语句 */
.segment-item.is-highlighted {
  border-color: rgba(47, 107, 255, 0.5);
  background: rgba(47, 107, 255, 0.12);
  box-shadow: 0 0 0 3px rgba(47, 107, 255, 0.15);
}

</style>
