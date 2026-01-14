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
          <div class="subtitle">多数设置仅影响本地客户端；语句拆分设置会同步到后端</div>
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
                AI 分析提示词
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">AI 分析提示词模板</div>
              <div class="pane-subtitle">可创建多个模板，并设置默认模板（用于会议 AI 分析）。</div>

              <div class="prompts-toolbar">
                <el-button size="small" type="primary" @click="openCreateDialog">
                  + 新建模板
                </el-button>
              </div>

              <div class="prompts-list">
                <div
                  v-for="tpl in form.promptTemplates"
                  :key="tpl.id"
                  class="prompt-card"
                >
                  <div class="prompt-top">
                    <div class="prompt-title">
                      <span class="prompt-name">{{ tpl.name }}</span>
                      <el-tag
                        v-if="tpl.id === form.defaultPromptTemplateId"
                        size="small"
                        type="success"
                      >
                        默认
                      </el-tag>
                    </div>
                    <div class="prompt-actions">
                      <el-button
                        size="small"
                        class="ghost-button"
                        :disabled="tpl.id === form.defaultPromptTemplateId"
                        @click="setDefaultTemplate(tpl.id)"
                      >
                        设为默认
                      </el-button>
                      <el-button size="small" class="ghost-button" @click="openEditDialog(tpl.id)">
                        编辑
                      </el-button>
                      <el-button size="small" type="danger" plain @click="deleteTemplate(tpl.id)">
                        删除
                      </el-button>
                    </div>
                  </div>

                  <div class="prompt-meta">
                    <span>模板ID: <span class="mono">{{ tpl.id }}</span></span>
                    <span>更新: {{ formatDateTime(tpl.updatedAt) }}</span>
                  </div>

                  <pre class="prompt-preview">{{ tpl.prompt }}</pre>
                </div>
              </div>
            </section>
          </el-tab-pane>

          <el-tab-pane name="segmentation">
            <template #label>
              <span class="tab-label">
                <el-icon><Document /></el-icon>
                语句拆分提示设置
              </span>
            </template>
            <section class="pane">
              <div class="pane-title">语句拆分提示设置</div>
              <div class="pane-subtitle">配置语句拆分的系统提示词与上下文窗口等参数。</div>

              <el-form label-position="top" :model="form" class="pane-form">
                <el-form-item label="系统提示词">
                  <el-input
                    v-model="form.segmentationSystemPrompt"
                    type="textarea"
                    :autosize="{ minRows: 8, maxRows: 18 }"
                    placeholder="用于语句拆分的系统提示词"
                  />
                  <div class="hint">调整后将影响语句拆分的系统提示词规则。</div>
                </el-form-item>

                <div class="grid two-col">
                  <el-form-item label="上下文窗口事件数">
                    <el-input-number
                      v-model="form.segmentationWindowEvents"
                      :min="5"
                      :max="2000"
                      :step="1"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                  <el-form-item label="拆分触发间隔 (ms)">
                    <el-input-number
                      v-model="form.segmentationIntervalMs"
                      :min="0"
                      :max="600000"
                      :step="100"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                  <el-form-item label="GLM 模型">
                    <el-input v-model="form.segmentationModel" placeholder="如 GLM-4X" />
                  </el-form-item>
                  <el-form-item label="最大输出 tokens">
                    <el-input-number
                      v-model="form.segmentationMaxTokens"
                      :min="256"
                      :max="8192"
                      :step="128"
                      controls-position="right"
                      class="mono-input"
                    />
                  </el-form-item>
                </div>

                <div class="grid two-col">
                  <el-form-item label="JSON 模式">
                    <el-switch v-model="form.segmentationJsonMode" />
                  </el-form-item>
                  <el-form-item label="触发条件：end_turn">
                    <el-switch v-model="form.segmentationTriggerOnEndTurn" />
                  </el-form-item>
                  <el-form-item label="触发条件：stop_transcribe">
                    <el-switch v-model="form.segmentationTriggerOnStopTranscribe" />
                  </el-form-item>
                </div>

                <div class="hint">触发间隔为 0 表示每次事件更新都会尝试拆分；修改后可在会议页点击“重拆”立即生效。</div>
              </el-form>
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

  <el-dialog
    v-model="promptDialogVisible"
    :title="promptDialogMode === 'create' ? '新建 AI 分析提示词模板' : '编辑 AI 分析提示词模板'"
    width="min(92vw, 720px)"
    append-to-body
  >
    <el-form label-position="top" :model="promptForm" class="pane-form">
      <el-form-item label="模板名称">
        <el-input v-model="promptForm.name" placeholder="例如：会议摘要 / 行动项 / 完整报告" />
      </el-form-item>
      <el-form-item label="AI 分析提示词内容">
        <el-input
          v-model="promptForm.prompt"
          type="textarea"
          :autosize="{ minRows: 8, maxRows: 18 }"
          placeholder="支持 {{speeches}} 占位符"
        />
        <div class="hint">建议：使用 <span class="mono" v-text="SPEECH_PLACEHOLDER" /> 放置发言内容。</div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button size="small" @click="promptDialogVisible = false">取消</el-button>
      <el-button size="small" type="primary" @click="saveTemplate">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Connection,
  TrendCharts,
  DataAnalysis,
  Document,
  Microphone,
  Refresh,
  Close,
  Check,
} from '@element-plus/icons-vue'
import { useAppSettings, type AppSettings, type AsrModel, type PromptTemplate } from '@/composables/useAppSettings'
import { transcriptEventSegmentationConfigApi } from '@/services/api'
import { uuid } from '@/utils/uuid'

const SPEECH_PLACEHOLDER = '{{speeches}}'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const {
  settings,
  updateSettings,
  resetSettings,
  validateSettings,
  refreshSegmentationConfigFromServer,
} = useAppSettings()

const visibleProxy = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<AppSettings>({ ...settings.value })
const activeSection = ref<'asr' | 'vad' | 'analysis' | 'segmentation' | 'service'>('asr')

const asrModels: Array<{ value: AsrModel; label: string; desc: string }> = [
  { value: 'doubao', label: '豆包 ASR', desc: '实时、低延迟，适合会议录制' },
  { value: 'glm', label: 'GLM ASR', desc: '高精度，适合高噪声场景' },
]

const vadPreview = computed(() => {
  return `VAD_START_TH=${form.vadStartTh}  VAD_STOP_TH=${form.vadStopTh}  VAD_GAP_MS=${form.vadGapMs}  VAD_CONFIRM_MS=${form.vadConfirmMs}`
})

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      await refreshSegmentationConfigFromServer()
      Object.assign(form, settings.value)
      activeSection.value = 'asr'
    }
  },
)

const promptDialogVisible = ref(false)
const promptDialogMode = ref<'create' | 'edit'>('create')
const promptEditingId = ref<string>('')
const promptForm = reactive<{ name: string; prompt: string }>({ name: '', prompt: '' })

function openCreateDialog(): void {
  promptDialogMode.value = 'create'
  promptEditingId.value = ''
  promptForm.name = ''
  promptForm.prompt = ''
  promptDialogVisible.value = true
}

function openEditDialog(id: string): void {
  const tpl = form.promptTemplates.find(t => t.id === id)
  if (!tpl) return
  promptDialogMode.value = 'edit'
  promptEditingId.value = id
  promptForm.name = tpl.name
  promptForm.prompt = tpl.prompt
  promptDialogVisible.value = true
}

function setDefaultTemplate(id: string): void {
  if (!form.promptTemplates.some(t => t.id === id)) return
  form.defaultPromptTemplateId = id
  if (!form.activePromptTemplateId) {
    form.activePromptTemplateId = id
  }
  ElMessage.success('默认模板已更新（保存后生效）')
}

async function deleteTemplate(id: string): Promise<void> {
  const tpl = form.promptTemplates.find(t => t.id === id)
  if (!tpl) return
  if (form.promptTemplates.length <= 1) {
    ElMessage.warning('至少需要保留一个 AI 分析提示词模板')
    return
  }

  try {
    await ElMessageBox.confirm(`确定删除模板「${tpl.name}」吗？删除后不可恢复。`, '删除 AI 分析提示词模板', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  form.promptTemplates = form.promptTemplates.filter(t => t.id !== id)

  if (form.defaultPromptTemplateId === id) {
    form.defaultPromptTemplateId = form.promptTemplates[0]?.id || ''
  }
  if (form.activePromptTemplateId === id) {
    form.activePromptTemplateId = form.defaultPromptTemplateId || form.promptTemplates[0]?.id || ''
  }

  ElMessage.success('模板已删除（保存后生效）')
}

function saveTemplate(): void {
  const name = promptForm.name.trim()
  const prompt = promptForm.prompt.trim()
  if (!name) {
    ElMessage.error('模板名称不能为空')
    return
  }
  if (!prompt) {
    ElMessage.error('AI 分析提示词内容不能为空')
    return
  }

  const now = new Date().toISOString()
  if (promptDialogMode.value === 'create') {
    const newTemplate: PromptTemplate = {
      id: `tpl_${uuid().slice(0, 8)}`,
      name,
      prompt,
      createdAt: now,
      updatedAt: now,
    }
    form.promptTemplates = [newTemplate, ...(form.promptTemplates || [])]
    if (!form.defaultPromptTemplateId) {
      form.defaultPromptTemplateId = newTemplate.id
    }
    if (!form.activePromptTemplateId) {
      form.activePromptTemplateId = newTemplate.id
    }
    ElMessage.success('模板已创建（保存后生效）')
  } else {
    const id = promptEditingId.value
    const index = form.promptTemplates.findIndex(t => t.id === id)
    if (index < 0) return
    const prev = form.promptTemplates[index]
    form.promptTemplates[index] = {
      ...prev,
      name,
      prompt,
      updatedAt: now,
    }
    form.promptTemplates = form.promptTemplates.slice()
    ElMessage.success('模板已更新（保存后生效）')
  }

  promptDialogVisible.value = false
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', { hour12: false })
}

function buildSegmentationConfigPayload() {
  return {
    systemPrompt: form.segmentationSystemPrompt,
    windowEvents: form.segmentationWindowEvents,
    intervalMs: form.segmentationIntervalMs,
    triggerOnEndTurn: form.segmentationTriggerOnEndTurn,
    triggerOnStopTranscribe: form.segmentationTriggerOnStopTranscribe,
    model: form.segmentationModel,
    maxTokens: form.segmentationMaxTokens,
    jsonMode: form.segmentationJsonMode,
  }
}

async function syncSegmentationConfig(): Promise<boolean> {
  try {
    await transcriptEventSegmentationConfigApi.update(buildSegmentationConfigPayload())
    return true
  } catch (error) {
    console.error('语句拆分配置同步失败:', error)
    return false
  }
}

const onSave = async () => {
  const errors = validateSettings(form)
  if (errors.length > 0) {
    ElMessage.error(errors[0])
    return
  }
  updateSettings(form)
  const synced = await syncSegmentationConfig()
  if (synced) {
    ElMessage.success('设置已保存')
  } else {
    ElMessage.warning('设置已保存，但语句拆分设置同步失败')
  }
  visibleProxy.value = false
}

const onReset = async () => {
  try {
    await ElMessageBox.confirm('确定恢复默认设置？', '重置', { type: 'warning' })
    const next = resetSettings()
    Object.assign(form, next)

    try {
      const response = await transcriptEventSegmentationConfigApi.reset()
      updateSettings({
        segmentationSystemPrompt: response.data.systemPrompt,
        segmentationWindowEvents: response.data.windowEvents,
        segmentationIntervalMs: response.data.intervalMs,
        segmentationTriggerOnEndTurn: response.data.triggerOnEndTurn,
        segmentationTriggerOnStopTranscribe: response.data.triggerOnStopTranscribe,
        segmentationModel: response.data.model,
        segmentationMaxTokens: response.data.maxTokens,
        segmentationJsonMode: response.data.jsonMode,
      })
      Object.assign(form, settings.value)
      ElMessage.success('已恢复默认值')
    } catch (error) {
      console.error('语句拆分配置重置失败:', error)
      ElMessage.warning('已恢复默认值，但语句拆分设置重置失败')
    }
  } catch {
    // 用户取消
  }
}
</script>

<style scoped>
.settings-drawer :deep(.el-drawer__body) {
  padding: 0;
  background: var(--paper-50);
  background-image:
    linear-gradient(rgba(47, 107, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(47, 107, 255, 0.06) 1px, transparent 1px);
  background-size: 24px 24px;
}

.settings-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--font-sans);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
}

.title-block .title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink-900);
}

.title-block .subtitle {
  color: var(--ink-500);
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
  color: var(--ink-700);
  transition: all 0.15s ease;
}

.settings-tabs :deep(.el-tabs__item.is-active) {
  background: rgba(47, 107, 255, 0.10);
  color: var(--brand-700);
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
  border: 1px solid rgba(47, 107, 255, 0.12);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.06);
}

.pane-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-900);
}

.pane-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-500);
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
  color: var(--ink-500);
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
  border-color: rgba(47, 107, 255, 0.55);
  background: rgba(47, 107, 255, 0.06);
  box-shadow: 0 10px 26px rgba(47, 107, 255, 0.10);
}

.choice-card.is-checked .choice-title {
  color: var(--brand-700);
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
  border-color: rgba(47, 107, 255, 0.40);
  background: rgba(47, 107, 255, 0.06);
}

.choice-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-900);
}

.choice-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-500);
}

.mono-preview {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed rgba(47, 107, 255, 0.28);
  background: rgba(47, 107, 255, 0.04);
  color: var(--ink-700);
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

.prompts-toolbar {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.prompts-list {
  margin-top: 12px;
  display: grid;
  gap: 12px;
}

.prompt-card {
  border: 1px solid rgba(15, 23, 42, 0.10);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.80);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
  padding: 12px 12px;
}

.prompt-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.prompt-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.prompt-name {
  font-weight: 700;
  color: var(--ink-900);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.prompt-meta {
  margin-top: 8px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--ink-500);
}

.mono {
  font-family: var(--font-mono);
}

.prompt-preview {
  margin-top: 10px;
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.04);
  color: var(--ink-700);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
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
