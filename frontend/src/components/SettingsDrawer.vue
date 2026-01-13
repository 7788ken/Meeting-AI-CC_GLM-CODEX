<template>
  <el-drawer
    v-model="visibleProxy"
    :with-header="false"
    size="76%"
    direction="rtl"
    append-to-body
    class="settings-drawer"
    :destroy-on-close="false"
  >
    <div class="settings-shell">
      <header class="drawer-header">
        <div class="title-block">
          <div class="title">参数设置</div>
          <div class="subtitle">实时控制 ASR、VAD、分析默认值与服务地址</div>
        </div>
        <div class="header-actions">
          <el-button
            size="small"
            class="ghost-button"
            :icon="Refresh"
            @click="onReset"
          >
            重置
          </el-button>
          <el-button size="small" type="primary" @click="onSave">
            保存
          </el-button>
        </div>
      </header>

      <div class="drawer-body">
        <nav class="section-nav">
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="nav-item"
            :class="{ active: activeSection === section.id }"
            @click="activeSection = section.id"
          >
            <el-icon><component :is="section.icon" /></el-icon>
            <span>{{ section.label }}</span>
          </button>
        </nav>

        <div class="section-content">
          <section v-if="activeSection === 'asr'" class="card">
            <div class="card-header">
              <div>
                <div class="card-title">ASR 模型</div>
                <div class="card-desc">实时转写模型选择，影响音频发送参数</div>
              </div>
            </div>
            <el-form label-position="top" :model="form" class="card-form">
              <el-form-item label="模型">
                <el-select v-model="form.asrModel" style="width: 240px">
                  <el-option
                    v-for="item in asrModels"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  >
                    <div class="option-row">
                      <span class="emoji">{{ item.icon }}</span>
                      <div class="option-text">
                        <div class="option-title">{{ item.label }}</div>
                        <div class="option-desc">{{ item.desc }}</div>
                      </div>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>
            </el-form>
          </section>

          <section v-else-if="activeSection === 'vad'" class="card">
            <div class="card-header">
              <div>
                <div class="card-title">VAD 参数</div>
                <div class="card-desc">能量阈值与静音窗口，决定分句敏感度</div>
              </div>
              <el-tag type="success" effect="dark" round size="small">
                {{ vadPreview }}
              </el-tag>
            </div>
            <el-form label-position="top" :model="form" class="card-form">
              <div class="grid two-col">
                <el-form-item label="起始阈值 (start_th)">
                  <el-input-number
                    v-model="form.vadStartTh"
                    :step="0.001"
                    :precision="3"
                    :min="0"
                  />
                </el-form-item>
                <el-form-item label="停止阈值 (stop_th)">
                  <el-input-number
                    v-model="form.vadStopTh"
                    :step="0.001"
                    :precision="3"
                    :min="0"
                  />
                </el-form-item>
                <el-form-item label="静音间隔 (gap_ms)">
                  <el-input-number v-model="form.vadGapMs" :step="50" :min="0" />
                </el-form-item>
                <el-form-item label="确认延迟 (confirm_ms)">
                  <el-input-number v-model="form.vadConfirmMs" :step="50" :min="0" />
                </el-form-item>
              </div>
              <div class="hint">建议：start ≥ stop；gap/confirm 过小会导致频繁分段。</div>
            </el-form>
          </section>

          <section v-else-if="activeSection === 'analysis'" class="card">
            <div class="card-header">
              <div>
                <div class="card-title">默认分析类型</div>
                <div class="card-desc">影响头部下拉初始值</div>
              </div>
            </div>
            <div class="tag-grid">
              <button
                v-for="item in analysisTypes"
                :key="item.value"
                type="button"
                class="tag-button"
                :class="{ active: form.analysisType === item.value }"
                @click="form.analysisType = item.value"
              >
                {{ item.label }}
              </button>
            </div>
          </section>

          <section v-else-if="activeSection === 'service'" class="card">
            <div class="card-header">
              <div>
                <div class="card-title">服务地址</div>
                <div class="card-desc">HTTP / WebSocket 覆盖值，仅前端使用</div>
              </div>
              <el-tag type="warning" effect="plain" round size="small">本地覆盖，不改后端</el-tag>
            </div>
            <el-form label-position="top" :model="form" class="card-form">
              <el-form-item label="API 基础地址">
                <el-input v-model="form.apiBaseUrl" placeholder="如 https://host/api 或 /api" />
              </el-form-item>
              <el-form-item label="WebSocket 地址">
                <el-input v-model="form.wsUrl" placeholder="如 wss://host/transcript" />
              </el-form-item>
            </el-form>
          </section>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, TrendCharts, DataAnalysis, Microphone, Refresh } from '@element-plus/icons-vue'
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

const sections = [
  { id: 'asr', label: 'ASR 模型', icon: Microphone },
  { id: 'vad', label: 'VAD 参数', icon: TrendCharts },
  { id: 'analysis', label: '分析类型', icon: DataAnalysis },
  { id: 'service', label: '服务地址', icon: Connection },
]

const analysisTypes = [
  { label: '会议摘要', value: 'summary' as AppSettings['analysisType'] },
  { label: '行动项', value: 'action-items' as AppSettings['analysisType'] },
  { label: '情感分析', value: 'sentiment' as AppSettings['analysisType'] },
  { label: '关键词', value: 'keywords' as AppSettings['analysisType'] },
  { label: '议题分析', value: 'topics' as AppSettings['analysisType'] },
]

const asrModels: Array<{ value: AsrModel; label: string; desc: string; icon: string }> = [
  { value: 'doubao', label: '豆包 ASR', desc: '实时、低延迟，适合会议录制', icon: '🥣' },
  { value: 'glm', label: 'GLM ASR', desc: '高精度，适合高噪声场景', icon: '🧠' },
]

const vadPreview = computed(() => {
  return `start=${form.vadStartTh} stop=${form.vadStopTh} gap=${form.vadGapMs}ms`
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
  background: #f4f5f2;
}

.settings-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e7ebef;
  background: linear-gradient(135deg, #f8faf7 0%, #eef3ee 100%);
}

.title-block .title {
  font-size: 18px;
  font-weight: 700;
  color: #1b4332;
}

.title-block .subtitle {
  color: #6c757d;
  font-size: 12px;
  margin-top: 4px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.drawer-body {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 0;
}

.section-nav {
  border-right: 1px solid #e7ebef;
  padding: 16px;
  background: #f7f9f6;
  display: grid;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #dce4dd;
  border-radius: 10px;
  background: #fff;
  color: #1b4332;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-item:hover {
  border-color: #2d6a4f;
  box-shadow: 0 4px 12px rgba(45, 106, 79, 0.08);
}

.nav-item.active {
  border-color: #2d6a4f;
  background: rgba(45, 106, 79, 0.08);
  color: #1b4332;
}

.section-content {
  padding: 16px 20px;
  overflow-y: auto;
}

.card {
  background: #fff;
  border: 1px solid #e7ebef;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.04);
}

.card + .card {
  margin-top: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  color: #1b4332;
}

.card-desc {
  font-size: 12px;
  color: #6c757d;
  margin-top: 4px;
}

.card-form {
  display: grid;
  gap: 8px;
}

.grid.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px 16px;
}

.hint {
  margin-top: 6px;
  font-size: 12px;
  color: #6c757d;
}

.tag-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-button {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid #dce4dd;
  background: #fff;
  color: #1b4332;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tag-button.active {
  border-color: #2d6a4f;
  background: rgba(45, 106, 79, 0.08);
}

.tag-button:hover {
  border-color: #2d6a4f;
}

.ghost-button {
  border-color: #d0d7d3;
  color: #4b6256;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-text .option-title {
  font-weight: 600;
}

.option-text .option-desc {
  font-size: 12px;
  color: #6c757d;
}

.emoji {
  font-size: 16px;
}

@media (max-width: 960px) {
  .drawer-body {
    grid-template-columns: 1fr;
  }

  .section-nav {
    display: flex;
    flex-wrap: wrap;
  }
}
</style>
