<template>
  <div class="turn-segments-panel">
    <div class="panel-meta">
      <el-tag v-if="status === 'processing'" type="warning" size="small">processing</el-tag>
      <el-tag v-else-if="status === 'failed'" type="danger" size="small">failed</el-tag>
      <el-tag v-else type="success" size="small">completed</el-tag>
      <span class="meta-text">targetRevision: {{ targetRevision }}</span>
      <span class="meta-text">revision: {{ revision }}</span>
    </div>

    <el-alert
      v-if="status === 'failed' && error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
      class="error-alert"
    />

    <div v-if="segments.length === 0" class="empty">
      <el-empty description="暂无轮次分段" />
    </div>

    <div v-else class="segment-list">
      <div v-for="(segment, idx) in orderedSegments" :key="idx" class="segment-item">
        <div class="segment-header">
          <span class="speaker-name">{{ segment.speakerName }}</span>
          <span class="segment-range">#{{ segment.startEventIndex }}-#{{ segment.endEventIndex }}</span>
        </div>
        <div class="segment-content">{{ getTextByRange(segment.startEventIndex, segment.endEventIndex) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TurnSegmentRange } from '@/services/api'

const props = defineProps<{
  status: 'processing' | 'completed' | 'failed'
  revision: number
  targetRevision: number
  segments: TurnSegmentRange[]
  error?: string
  getTextByRange: (startEventIndex: number, endEventIndex: number) => string
}>()

const orderedSegments = computed(() =>
  [...props.segments].sort((a, b) => (b.endEventIndex ?? 0) - (a.endEventIndex ?? 0))
)
</script>

<style scoped>
.turn-segments-panel {
  height: 100%;
  overflow: auto;
  padding: 0 8px;
}

.panel-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.meta-text {
  font-size: 12px;
  color: #666;
}

.error-alert {
  margin-bottom: 10px;
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

.segment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.speaker-name {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f5f7fa;
  color: #333;
  font-size: 12px;
}

.segment-range {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 12px;
  color: #999;
}

.segment-content {
  white-space: pre-wrap;
  line-height: 1.5;
  color: #111;
}
</style>
