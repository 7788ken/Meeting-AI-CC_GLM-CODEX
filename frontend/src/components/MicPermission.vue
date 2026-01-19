<template>
  <el-dialog
    v-model="visible"
    title="麦克风权限"
    width="400px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="mic-permission-content">
      <el-icon class="mic-icon" :size="48">
        <Microphone />
      </el-icon>

      <template v-if="permissionStatus === 'prompt'">
        <p class="permission-text">AI 会议助手需要访问您的麦克风以进行语音转写</p>
        <p class="permission-hint">请在弹出的浏览器对话框中点击"允许"</p>
      </template>

      <template v-else-if="permissionStatus === 'denied'">
        <p class="permission-text permission-denied">麦克风权限已被拒绝</p>
        <p class="permission-hint">请在浏览器设置中允许麦克风访问，然后刷新页面</p>
        <el-alert title="如何开启麦克风权限" type="info" :closable="false" show-icon>
          <template #default>
            <ol class="permission-steps">
              <li>点击浏览器地址栏左侧的锁图标</li>
              <li>找到"麦克风"设置</li>
              <li>选择"允许"</li>
              <li>刷新页面</li>
            </ol>
          </template>
        </el-alert>
      </template>

      <template v-else-if="permissionStatus === 'granted'">
        <p class="permission-text permission-granted">
          <el-icon><Check /></el-icon>
          麦克风权限已授予
        </p>
      </template>

      <template v-else-if="permissionStatus === 'checking'">
        <p class="permission-text">正在检查麦克风权限...</p>
      </template>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <template v-if="permissionStatus === 'prompt'">
          <el-button @click="handleCancel">取消</el-button>
          <el-button type="primary" :loading="requesting" @click="handleRequest">
            允许麦克风访问
          </el-button>
        </template>
        <template v-else-if="permissionStatus === 'denied'">
          <el-button @click="handleCancel">关闭</el-button>
          <el-button type="primary" @click="handleRetry">重试</el-button>
        </template>
        <template v-else-if="permissionStatus === 'granted'">
          <el-button type="primary" @click="handleContinue">继续</el-button>
        </template>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Microphone, Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

type PermissionStatus = 'checking' | 'prompt' | 'granted' | 'denied'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    autoCheck?: boolean
  }>(),
  {
    autoCheck: true,
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'granted'): void
  (event: 'denied'): void
  (event: 'cancel'): void
}>()

const permissionStatus = ref<PermissionStatus>('checking')
const requesting = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})

/**
 * 检查麦克风权限状态
 */
async function checkPermission(): Promise<PermissionStatus> {
  permissionStatus.value = 'checking'

  // 检查浏览器是否支持相关 API
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    permissionStatus.value = 'denied'
    return 'denied'
  }

  // 尝试获取权限状态（部分浏览器支持）
  try {
    const permissions = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return permissions.state === 'granted'
      ? 'granted'
      : permissions.state === 'denied'
        ? 'denied'
        : 'prompt'
  } catch {
    // 如果 permissions API 不支持，尝试实际请求
    return 'prompt'
  }
}

/**
 * 请求麦克风权限
 */
async function requestPermission(): Promise<boolean> {
  requesting.value = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // 立即停止流，只是检查权限
    stream.getTracks().forEach(track => track.stop())

    permissionStatus.value = 'granted'
    emit('granted')
    ElMessage.success('麦克风权限已授予')
    return true
  } catch (error) {
    console.error('麦克风权限请求失败:', error)
    permissionStatus.value = 'denied'
    emit('denied')
    ElMessage.error('麦克风权限被拒绝')
    return false
  } finally {
    requesting.value = false
  }
}

/**
 * 处理用户点击"允许麦克风访问"
 */
async function handleRequest() {
  await requestPermission()
}

/**
 * 处理用户点击"取消"
 */
function handleCancel() {
  visible.value = false
  emit('cancel')
}

/**
 * 处理用户点击"重试"
 */
async function handleRetry() {
  await checkPermission()
  if (permissionStatus.value === 'prompt') {
    await requestPermission()
  }
}

/**
 * 处理用户点击"继续"
 */
function handleContinue() {
  visible.value = false
}

/**
 * 监听对话框打开，自动检查权限
 */
watch(
  () => props.modelValue,
  async opened => {
    if (opened && props.autoCheck) {
      const status = await checkPermission()
      if (status === 'granted') {
        emit('granted')
      } else if (status === 'denied') {
        emit('denied')
      }
    }
  },
  { immediate: true }
)

// 导出方法供父组件调用
defineExpose({
  checkPermission,
  requestPermission,
})
</script>

<style scoped>
.mic-permission-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  min-height: 200px;
}

.mic-icon {
  margin-bottom: 20px;
  color: #409eff;
}

.permission-text {
  font-size: 16px;
  color: #333;
  text-align: center;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.permission-denied {
  color: #f56c6c;
  font-weight: 500;
}

.permission-granted {
  color: #67c23a;
  font-weight: 500;
}

.permission-hint {
  font-size: 14px;
  color: #666;
  text-align: center;
  margin-bottom: 16px;
}

.permission-steps {
  margin: 8px 0 0 20px;
  font-size: 13px;
  line-height: 1.8;
  color: #666;
}

.dialog-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
