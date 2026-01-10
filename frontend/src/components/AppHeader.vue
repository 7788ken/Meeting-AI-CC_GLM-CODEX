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
    <el-tag :type="statusTagType" size="small">
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
}

.app-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1890ff;
}

.back-button {
  padding: 0 8px;
}
</style>
