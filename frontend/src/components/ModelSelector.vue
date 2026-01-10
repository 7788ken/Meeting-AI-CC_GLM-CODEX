<template>
  <el-select
    :model-value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :size="size"
    class="model-selector"
    @update:model-value="handleChange"
  >
    <el-option
      v-for="item in AI_MODELS"
      :key="item.value"
      :label="item.label"
      :value="item.value"
      :disabled="item.disabled"
    />
  </el-select>
</template>

<script setup lang="ts">
import { type AIModel, AI_MODELS } from '@/types'

interface Props {
  /** 当前选中的模型 */
  modelValue: AIModel
  /** 是否禁用 */
  disabled?: boolean
  /** 占位符文本 */
  placeholder?: string
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  placeholder: '选择 AI 模型',
  size: 'default',
})

interface Emits {
  (event: 'update:modelValue', value: AIModel): void
  (event: 'change', value: AIModel): void
}

const emit = defineEmits<Emits>()

function handleChange(value: AIModel) {
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
.model-selector {
  width: 100%;
}
</style>
