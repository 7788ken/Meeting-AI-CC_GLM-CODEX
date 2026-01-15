<template>
  <el-button
    :type="mainButtonType"
    :icon="mainButtonIcon"
    size="small"
    :loading="status === 'connecting'"
    :disabled="disabled"
    @click="emit('toggle')"
  >
    {{ mainButtonText }}
  </el-button>

  <el-button v-if="status === 'recording'" size="small" :disabled="disabled" @click="emit('pause')">
    {{ isPaused ? '继续' : '暂停' }}
  </el-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type RecordingStatus = 'idle' | 'connecting' | 'recording' | 'paused' | 'error'

const props = withDefaults(
  defineProps<{
    status: RecordingStatus
    isPaused: boolean
    disabled?: boolean
    disabledText?: string
  }>(),
  {
    disabled: false,
    disabledText: '会话已结束',
  },
)

const emit = defineEmits<{
  (event: 'toggle'): void
  (event: 'pause'): void
}>()

const mainButtonType = computed(() => (props.status === 'recording' ? 'warning' : 'success'))
const mainButtonIcon = computed(() => (props.status === 'recording' ? 'VideoPause' : 'VideoPlay'))

const mainButtonText = computed(() => {
  if (props.disabled) return props.disabledText

  switch (props.status) {
    case 'connecting':
      return '连接中...'
    case 'recording':
      return '停止录音'
    case 'paused':
      return '已暂停'
    case 'error':
      return '出错了'
    default:
      return '开始录音'
  }
})
</script>
