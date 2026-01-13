<template>
  <div class="event-segments-panel">
    <div v-if="segments.length === 0" class="empty">
      <el-empty description="暂无语句拆分结果" />
    </div>

    <div v-else class="segment-list">
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
import { computed } from 'vue'
import type { TranscriptEventSegment } from '@/services/api'

const props = defineProps<{
  segments: TranscriptEventSegment[]
}>()

const orderedSegments = computed(() =>
  [...props.segments].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))
)
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
