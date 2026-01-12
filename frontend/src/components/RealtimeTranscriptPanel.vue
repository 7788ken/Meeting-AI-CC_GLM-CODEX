<template>
  <div class="realtime-transcript-panel">
    <div v-if="events.length === 0" class="empty">
      <el-empty description="暂无原文事件流" />
    </div>

    <div v-else class="transcript-stream">
      <span
        v-for="event in events"
        :key="event.eventIndex"
        :class="['stream-item', { 'is-final': event.isFinal }]"
      >
        <span class="content">{{ event.content }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TranscriptEvent } from '@/services/api'

defineProps<{
  events: TranscriptEvent[]
}>()
</script>

<style scoped>
.realtime-transcript-panel {
  height: 100%;
  overflow: auto;
}

.empty {
  padding: 16px 0;
}

.transcript-stream {
  line-height: 1.8;
  color: #111;
  white-space: pre-wrap;
}

.stream-item {
  display: inline;
}

.stream-item:not(:last-child)::after {
  content: '';
  margin-right: 0;
}

.speaker-inline {
  font-weight: 600;
  color: #333;
}

.content {
  color: #111;
}

.stream-item:not(.is-final) .content {
  color: #999;
}
</style>

