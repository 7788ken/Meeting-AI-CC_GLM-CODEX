<template>
  <div class="header-left">
    <el-button
      v-if="showBackButton"
      size="small"
      class="back-button"
      @click="emit('back')"
    >
      ← 返回
    </el-button>
    <h1 class="app-title">{{ title }}</h1>
    <el-tag :type="statusTagType" size="small" :class="['status-pill', status === 'active' ? 'is-active' : 'is-ended']">
      <span class="status-dot" />
      {{ statusText }}
    </el-tag>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type MeetingStatus = 'active' | 'ended'

const props = withDefaults(
  defineProps<{
    title: string
    showBackButton?: boolean
    status?: MeetingStatus
  }>(),
  {
    showBackButton: true,
    status: 'ended',
  },
)

const emit = defineEmits<{
  (event: 'back'): void
}>()

const statusTagType = computed(() => (props.status === 'active' ? 'success' : 'info'))
const statusText = computed(() => (props.status === 'active' ? '会话进行中' : '会话已结束'))
</script>

<style scoped>
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.app-title {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0.2px;
  color: var(--ink-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.back-button {
  padding: 0 10px;
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.55);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-color: rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(10px);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.24);
}

.status-pill.is-active .status-dot {
  background: var(--success-500);
  animation: pulse-ring 1.4s var(--ease-out) infinite;
}

.status-pill.is-ended .status-dot {
  background: rgba(15, 23, 42, 0.24);
}
</style>
