<template>
  <div class="settings-container">
    <header class="settings-header app-surface">
      <div class="title-stack">
        <h1 class="settings-title">设置</h1>
        <div class="settings-subtitle">包含本地偏好与后端服务配置</div>
      </div>
      <el-button size="small" class="ghost-button" @click="router.push('/')">← 返回</el-button>
    </header>

    <SettingsDrawer v-model="open" />

    <main v-if="false" class="settings-main">
      <el-card class="settings-card" shadow="hover">
        <template #header>
          <h2>录音设置</h2>
        </template>

        <el-form label-width="120px">
          <el-form-item label="麦克风设备">
            <el-select v-model="selectedMic" placeholder="选择麦克风" style="width: 100%">
              <el-option
                v-for="mic in microphones"
                :key="mic.deviceId"
                :label="mic.label || `麦克风 ${mic.deviceId}`"
                :value="mic.deviceId"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="音频质量">
            <el-radio-group v-model="audioQuality">
              <el-radio-button label="low">低</el-radio-button>
              <el-radio-button label="medium">中</el-radio-button>
              <el-radio-button label="high">高</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="录音来源">
            <el-radio-group v-model="audioCaptureModeProxy">
              <el-radio-button label="mic">仅麦克风</el-radio-button>
              <el-radio-button label="tab">仅标签页音频</el-radio-button>
              <el-radio-button label="mix">麦克风+标签页音频</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="settings-card" shadow="hover">
        <template #header>
          <h2>转写设置</h2>
        </template>

        <el-form label-width="120px">
          <el-form-item label="转写语言">
            <el-select v-model="language" style="width: 100%">
              <el-option label="中文" value="zh" />
              <el-option label="English" value="en" />
              <el-option label="混合" value="mixed" />
            </el-select>
          </el-form-item>

          <el-form-item label="智能标点">
            <el-switch v-model="autoPunctuation" />
          </el-form-item>

          <el-form-item label="显示置信度">
            <el-switch v-model="showConfidence" />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="settings-card" shadow="hover">
        <template #header>
          <h2>AI模型设置</h2>
        </template>

        <el-form label-width="120px">
          <el-form-item label="默认模型">
            <el-select v-model="defaultModel" style="width: 100%">
              <el-option
                v-for="model in AI_MODELS"
                :key="model.value"
                :label="model.label"
                :value="model.value"
              />
            </el-select>
          </el-form-item>

        </el-form>
      </el-card>

      <el-card class="settings-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <h2>后端服务配置</h2>
            <el-button size="small" type="primary" @click="saveBackendConfig">保存</el-button>
          </div>
        </template>

        <el-form label-width="140px">
          <el-form-item label="GLM API Key">
            <el-input v-model="backendForm.glmApiKey" show-password placeholder="如 apiKey 或 apiKey.secret" />
          </el-form-item>
          <el-form-item label="GLM Endpoint">
            <el-input
              v-model="backendForm.glmEndpoint"
              placeholder="https://open.bigmodel.cn/api/paas/v4/chat/completions"
            />
          </el-form-item>
          <el-form-item label="会议总结模型">
            <el-input v-model="backendForm.glmTranscriptSummaryModel" placeholder="如 GLM-4.6V-Flash" />
          </el-form-item>
          <el-form-item label="会议总结最大 tokens">
            <el-input-number v-model="backendForm.glmTranscriptSummaryMaxTokens" :min="256" :max="8192" :step="128" />
          </el-form-item>
          <el-form-item label="会议总结深度思考">
            <el-switch v-model="backendForm.glmTranscriptSummaryThinking" />
          </el-form-item>

          <el-form-item label="并发上限">
            <el-input-number v-model="backendForm.glmGlobalConcurrency" :min="1" :max="50" :step="1" />
          </el-form-item>
          <el-form-item label="最小间隔 (ms)">
            <el-input-number v-model="backendForm.glmGlobalMinIntervalMs" :min="0" :max="60000" :step="100" />
          </el-form-item>
          <el-form-item label="冷却时间 (ms)">
            <el-input-number v-model="backendForm.glmGlobalRateLimitCooldownMs" :min="0" :max="120000" :step="100" />
          </el-form-item>
          <el-form-item label="冷却上限 (ms)">
            <el-input-number v-model="backendForm.glmGlobalRateLimitMaxMs" :min="0" :max="300000" :step="100" />
          </el-form-item>

          <el-form-item label="重试次数">
            <el-input-number v-model="backendForm.glmTranscriptSummaryRetryMax" :min="0" :max="10" :step="1" />
          </el-form-item>
          <el-form-item label="退避基准 (ms)">
            <el-input-number v-model="backendForm.glmTranscriptSummaryRetryBaseMs" :min="0" :max="60000" :step="100" />
          </el-form-item>
          <el-form-item label="退避上限 (ms)">
            <el-input-number v-model="backendForm.glmTranscriptSummaryRetryMaxMs" :min="0" :max="120000" :step="100" />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="settings-card" shadow="hover">
        <template #header>
          <h2>外观设置</h2>
        </template>

        <el-form label-width="120px">
          <el-form-item label="主题">
            <el-radio-group v-model="theme">
              <el-radio-button label="light">浅色</el-radio-button>
              <el-radio-button label="dark">深色</el-radio-button>
              <el-radio-button label="auto">跟随系统</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="字体大小">
            <el-slider v-model="fontSize" :min="12" :max="20" show-input />
          </el-form-item>
        </el-form>
      </el-card>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import SettingsDrawer from '@/components/SettingsDrawer.vue'
import { AI_MODELS } from '@/types'
import { useBackendConfig } from '@/composables/useBackendConfig'
import { useAppSettings } from '@/composables/useAppSettings'
import type { BackendConfig } from '@/services/api'

const router = useRouter()
const open = ref(true)

// 状态
const microphones = ref<MediaDeviceInfo[]>([])
const selectedMic = ref<string>('')
const audioQuality = ref<string>('medium')
const language = ref<string>('zh')
const autoPunctuation = ref<boolean>(true)
const showConfidence = ref<boolean>(false)
const defaultModel = ref<string>('glm')
const theme = ref<string>('light')
const fontSize = ref<number>(14)
const { settings: appSettings, updateSettings } = useAppSettings()
const { backendConfig, refreshBackendConfig, updateBackendConfig } = useBackendConfig()
const backendForm = reactive<BackendConfig>({ ...backendConfig.value })

const audioCaptureModeProxy = computed({
  get: () => appSettings.value.audioCaptureMode,
  set: (mode) => updateSettings({ audioCaptureMode: mode }),
})

// 获取麦克风列表
async function getMicrophones() {
  try {
    // 需要先请求权限才能获取设备列表
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
    const devices = await navigator.mediaDevices.enumerateDevices()
    microphones.value = devices.filter((d) => d.kind === 'audioinput')

    const preferred = appSettings.value.micDeviceId
    const preferredExists = preferred && microphones.value.some((mic) => mic.deviceId === preferred)
    if (preferredExists) {
      selectedMic.value = preferred
    } else if (microphones.value.length > 0) {
      selectedMic.value = microphones.value[0]?.deviceId ?? ''
    }
  } catch (error) {
    console.error('获取麦克风列表失败:', error)
  }
}

// /settings 页面已整合为 SettingsDrawer 的入口；旧 SettingsView 的副作用逻辑（请求麦克风/拉取后端配置）
// 在此停用，避免访问 /settings 时触发多余权限弹窗或请求。

watch(open, (visible) => {
  if (!visible) router.push('/')
})

async function saveBackendConfig() {
  const ok = await updateBackendConfig(backendForm)
  if (ok) {
    Object.assign(backendForm, backendConfig.value)
    ElMessage.success('后端配置已保存')
  } else {
    ElMessage.warning('后端配置保存失败')
  }
}
</script>

<style scoped>
.settings-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: transparent;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  margin: 12px 12px 0;
  position: sticky;
  top: 12px;
  z-index: 10;
}

.title-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-900);
  letter-spacing: 0.2px;
}

.settings-subtitle {
  font-size: 12px;
  color: var(--ink-500);
  letter-spacing: 0.2px;
}

.settings-main {
  flex: 1;
  overflow-y: auto;
  padding: 14px 12px 18px;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
}

.settings-card {
  margin-bottom: 16px;
  border-radius: var(--radius-md);
  border-color: rgba(15, 23, 42, 0.10);
  animation: rise-in 420ms var(--ease-out) both;
}

.settings-card :deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(10px);
}

.settings-card h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink-900);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ghost-button {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.55);
}

@media (max-width: 768px) {
  .settings-header {
    margin: 10px 10px 0;
    top: 10px;
  }
}
</style>
