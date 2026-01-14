<template>
  <div class="settings-container">
    <header class="settings-header app-surface">
      <div class="title-stack">
        <h1 class="settings-title">设置</h1>
        <div class="settings-subtitle">本页为前端本地设置示例（不修改后端）</div>
      </div>
      <el-button size="small" class="ghost-button" @click="router.push('/')">← 返回</el-button>
    </header>

    <main class="settings-main">
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

          <el-form-item label="分析类型">
            <el-checkbox-group v-model="enabledAnalysisTypes">
              <el-checkbox label="core">核心要点</el-checkbox>
              <el-checkbox label="brief">简要回答</el-checkbox>
              <el-checkbox label="deep">深度分析</el-checkbox>
            </el-checkbox-group>
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { AI_MODELS } from '@/types'

const router = useRouter()

// 状态
const microphones = ref<MediaDeviceInfo[]>([])
const selectedMic = ref<string>('')
const audioQuality = ref<string>('medium')
const language = ref<string>('zh')
const autoPunctuation = ref<boolean>(true)
const showConfidence = ref<boolean>(false)
const defaultModel = ref<string>('glm')
const enabledAnalysisTypes = ref<string[]>(['core', 'brief', 'deep'])
const theme = ref<string>('light')
const fontSize = ref<number>(14)

// 获取麦克风列表
async function getMicrophones() {
  try {
    // 需要先请求权限才能获取设备列表
    await navigator.mediaDevices.getUserMedia({ audio: true })
    const devices = await navigator.mediaDevices.enumerateDevices()
    microphones.value = devices.filter((d) => d.kind === 'audioinput')

    if (microphones.value.length > 0) {
      selectedMic.value = microphones.value[0].deviceId
    }
  } catch (error) {
    console.error('获取麦克风列表失败:', error)
  }
}

onMounted(() => {
  getMicrophones()
})
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
