<template>
  <el-drawer
    v-model="visibleProxy"
    :with-header="false"
    size="min(92vw, 720px)"
    direction="rtl"
    append-to-body
    class="settings-drawer"
    :destroy-on-close="false"
  >
    <div class="settings-shell">
      <header class="drawer-header">
        <div class="title-block">
          <div class="title">设置</div>
          <div class="subtitle">仅影响本地客户端行为，不修改后端</div>
        </div>
        <div class="header-actions">
          <el-button size="small" class="icon-button" @click="visibleProxy = false">
            <el-icon><Close /></el-icon>
          </el-button>
          <el-button
            size="small"
            class="ghost-button"
            :icon="Refresh"
            @click="onReset"
          >
            重置
          </el-button>
          <el-button size="small" type="primary" :icon="Check" @click="onSave">
            保存并关闭
          </el-button>
        </div>
      </header>

      <div class="drawer-body">
        <el-tabs v-model="activeSection" tab-position="left" class="settings-tabs">
          <el-tab-pane name="asr">
            <template #label>
              <span class="tab-label">
                <el-icon><Microphone /></el-icon>
                ASR
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">ASR 模型</div>
              <div class="pane-subtitle">影响会话录音时的转写模型选择</div>

              <el-radio-group v-model="form.asrModel" class="choice-grid">
                <el-radio
                  v-for="item in asrModels"
                  :key="item.value"
                  :label="item.value"
                  border
                  class="choice-card"
                >
                  <div class="choice-title">{{ item.label }}</div>
                  <div class="choice-desc">{{ item.desc }}</div>
                </el-radio>
              </el-radio-group>
            </section>
          </el-tab-pane>

          <el-tab-pane name="vad">
            <template #label>
              <span class="tab-label">
                <el-icon><TrendCharts /></el-icon>
                VAD
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">VAD 参数</div>
              <div class="pane-subtitle">能量阈值与静音窗口，决定分句敏感度</div>

              <div class="mono-preview">{{ vadPreview }}</div>

              <el-form label-position="top" :model="form" class="pane-form">
                <div class="grid two-col">
                  <el-form-item label="起始阈值 (start_th)">
                    <el-input-number
                      v-model="form.vadStartTh"
                      :step="0.001"
                      :precision="3"
                      :min="0"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                  <el-form-item label="停止阈值 (stop_th)">
                    <el-input-number
                      v-model="form.vadStopTh"
                      :step="0.001"
                      :precision="3"
                      :min="0"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                  <el-form-item label="静音间隔 (gap_ms)">
                    <el-input-number
                      v-model="form.vadGapMs"
                      :step="50"
                      :min="0"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                  <el-form-item label="确认延迟 (confirm_ms)">
                    <el-input-number
                      v-model="form.vadConfirmMs"
                      :step="50"
                      :min="0"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                </div>
                <div class="hint">建议：start ≥ stop；gap/confirm 过小会导致频繁分段。</div>
              </el-form>
            </section>
          </el-tab-pane>

          <el-tab-pane name="analysis">
            <template #label>
              <span class="tab-label">
                <el-icon><DataAnalysis /></el-icon>
                分析
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">默认分析类型</div>
              <div class="pane-subtitle">影响头部「分析类型」下拉初始值</div>

              <el-radio-group v-model="form.analysisType" class="choice-grid">
                <el-radio
                  v-for="item in analysisTypes"
                  :key="item.value"
                  :label="item.value"
                  border
                  class="choice-card"
                >
                  <div class="choice-title">{{ item.label }}</div>
                </el-radio>
              </el-radio-group>
            </section>
          </el-tab-pane>

          <el-tab-pane name="service">
            <template #label>
              <span class="tab-label">
                <el-icon><Connection /></el-icon>
                服务
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">服务地址</div>
              <div class="pane-subtitle">覆盖 HTTP / WebSocket 地址（仅前端）</div>

              <el-alert
                type="warning"
                show-icon
                :closable="false"
                class="alert"
                title="修改地址会影响后续请求/连接；录音中不建议修改。"
              />

              <el-form label-position="top" :model="form" class="pane-form">
                <el-form-item label="API 基础地址">
                  <el-input v-model="form.apiBaseUrl" placeholder="如 https://host/api 或 /api" />
                </el-form-item>
                <el-form-item label="WebSocket 地址">
                  <el-input v-model="form.wsUrl" placeholder="如 wss://host/transcript" />
                </el-form-item>
              </el-form>
            </section>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Connection,
  TrendCharts,
  DataAnalysis,
  Microphone,
  Refresh,
  Close,
  Check,
} from '@element-plus/icons-vue'
import { useAppSettings, type AppSettings, type AsrModel } from '@/composables/useAppSettings'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { settings, updateSettings, resetSettings, validateSettings } = useAppSettings()

const visibleProxy = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<AppSettings>({ ...settings.value })
const activeSection = ref<'asr' | 'vad' | 'analysis' | 'service'>('asr')

const analysisTypes = [
  { label: '会议摘要', value: 'summary' as AppSettings['analysisType'] },
  { label: '行动项', value: 'action-items' as AppSettings['analysisType'] },
  { label: '情感分析', value: 'sentiment' as AppSettings['analysisType'] },
  { label: '关键词', value: 'keywords' as AppSettings['analysisType'] },
  { label: '议题分析', value: 'topics' as AppSettings['analysisType'] },
]

const asrModels: Array<{ value: AsrModel; label: string; desc: string }> = [
  { value: 'doubao', label: '豆包 ASR', desc: '实时、低延迟，适合会议录制' },
  { value: 'glm', label: 'GLM ASR', desc: '高精度，适合高噪声场景' },
]

const vadPreview = computed(() => {
  return `VAD_START_TH=${form.vadStartTh}  VAD_STOP_TH=${form.vadStopTh}  VAD_GAP_MS=${form.vadGapMs}  VAD_CONFIRM_MS=${form.vadConfirmMs}`
})

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      Object.assign(form, settings.value)
      activeSection.value = 'asr'
    }
  },
)

const onSave = async () => {
  const errors = validateSettings(form)
  if (errors.length > 0) {
    ElMessage.error(errors[0])
    return
  }
  updateSettings(form)
  ElMessage.success('设置已保存')
  visibleProxy.value = false
}

const onReset = async () => {
  try {
    await ElMessageBox.confirm('确定恢复默认设置？', '重置', { type: 'warning' })
    const next = resetSettings()
    Object.assign(form, next)
    ElMessage.success('已恢复默认值')
  } catch {
    // 用户取消
  }
}
</script>

<style scoped>
.settings-drawer :deep(.el-drawer__body) {
  padding: 0;
  background: #f5f7fb;
  background-image:
    linear-gradient(rgba(24, 144, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(24, 144, 255, 0.06) 1px, transparent 1px);
  background-size: 24px 24px;
}

.settings-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family:
    "PingFang SC",
    "Microsoft YaHei",
    "Noto Sans CJK SC",
    system-ui,
    -apple-system,
    sans-serif;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e8e8e8;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
}

.title-block .title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2328;
}

.title-block .subtitle {
  color: #6b7280;
  font-size: 12px;
  margin-top: 4px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  padding: 14px 16px 16px;
}

.settings-tabs {
  height: 100%;
}

.settings-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.settings-tabs :deep(.el-tabs__nav-wrap) {
  padding-right: 10px;
}

.settings-tabs :deep(.el-tabs__item) {
  height: 44px;
  line-height: 44px;
  border-radius: 10px;
  margin: 4px 0;
  color: #4b5563;
  transition: all 0.15s ease;
}

.settings-tabs :deep(.el-tabs__item.is-active) {
  background: rgba(24, 144, 255, 0.10);
  color: #185abc;
}

.settings-tabs :deep(.el-tabs__active-bar) {
  background: transparent;
}

.settings-tabs :deep(.el-tabs__content) {
  height: 100%;
  overflow: hidden;
}

.settings-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.pane {
  height: 100%;
  overflow: auto;
  padding: 14px 16px 18px;
  border-radius: 14px;
  border: 1px solid rgba(24, 144, 255, 0.12);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.06);
}

.pane-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.pane-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.pane-form {
  margin-top: 14px;
}

.grid.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px 16px;
}

.hint {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
}

.choice-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.choice-card {
  width: 100%;
  align-items: flex-start;
  padding: 12px 12px;
  border-radius: 12px;
  border-color: rgba(31, 41, 55, 0.16);
  background: rgba(255, 255, 255, 0.7);
  transition: all 0.15s ease;
}

.choice-card.is-checked {
  border-color: rgba(24, 144, 255, 0.55);
  background: rgba(24, 144, 255, 0.06);
  box-shadow: 0 10px 26px rgba(24, 144, 255, 0.10);
}

.choice-card.is-checked .choice-title {
  color: #185abc;
}

.ghost-button {
  border-color: rgba(31, 41, 55, 0.16);
  color: #374151;
  background: rgba(255, 255, 255, 0.6);
}

.icon-button {
  border-color: rgba(31, 41, 55, 0.16);
  background: rgba(255, 255, 255, 0.6);
}

.icon-button:hover,
.ghost-button:hover {
  border-color: rgba(24, 144, 255, 0.40);
  background: rgba(24, 144, 255, 0.06);
}

.choice-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.choice-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.mono-preview {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed rgba(24, 144, 255, 0.28);
  background: rgba(24, 144, 255, 0.04);
  color: #1f2937;
  font-size: 12px;
  font-family:
    "JetBrains Mono",
    "SFMono-Regular",
    ui-monospace,
    "SF Mono",
    Menlo,
    monospace;
  line-height: 1.6;
  word-break: break-word;
}

.mono-input :deep(.el-input__inner) {
  font-family:
    "JetBrains Mono",
    "SFMono-Regular",
    ui-monospace,
    "SF Mono",
    Menlo,
    monospace;
}

.alert {
  margin-top: 12px;
}

@media (max-width: 960px) {
  .settings-tabs :deep(.el-tabs--left) {
    display: block;
  }

  .settings-tabs :deep(.el-tabs__header) {
    margin-bottom: 10px;
  }
}
</style>
