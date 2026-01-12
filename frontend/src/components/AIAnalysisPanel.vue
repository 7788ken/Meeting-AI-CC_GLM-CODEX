<template>
  <section class="ai-analysis-panel">
    <!-- 面板头部 -->
    <div class="panel-header">
      <h3 class="panel-title">AI 分析</h3>
      <div class="header-actions">
        <el-tag v-if="currentAnalysis?.isCached" type="info" size="small">缓存</el-tag>
        <el-dropdown trigger="click" @command="handleExport">
          <el-button size="small" text>
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="copy">复制结果</el-dropdown-item>
              <el-dropdown-item command="markdown">导出 Markdown</el-dropdown-item>
              <el-dropdown-item command="txt">导出纯文本</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 分析类型和模型选择 -->
    <div class="panel-body">
      <!-- 分析类型选择 -->
      <div class="form-item">
        <label class="form-label">分析类型</label>
        <el-select
          v-model="selectedAnalysisType"
          placeholder="选择分析类型"
          :disabled="disabled || isAnalyzing"
          class="full-width"
          @change="handleTypeChange"
        >
          <el-option-group label="基础分析">
            <el-option label="会议摘要" value="summary" />
            <el-option label="行动项" value="action-items" />
          </el-option-group>
          <el-option-group label="高级分析">
            <el-option label="情感分析" value="sentiment" />
            <el-option label="关键词" value="keywords" />
            <el-option label="议题分析" value="topics" />
          </el-option-group>
          <el-option-group label="综合报告">
            <el-option label="完整报告" value="full-report" />
          </el-option-group>
        </el-select>
      </div>

      <!-- AI 模型选择 -->
      <div class="form-item">
        <label class="form-label">AI 模型</label>
        <ModelSelector
          v-model="selectedModel"
          :disabled="disabled || isAnalyzing"
        />
      </div>

      <!-- 分析按钮 -->
      <div class="form-item">
        <el-button
          type="primary"
          :icon="analysisButtonIcon"
          :loading="isAnalyzing"
          :disabled="disabled || !canAnalyze"
          class="full-width"
          @click="handleAnalysis"
        >
          {{ analysisButtonText }}
        </el-button>
      </div>

      <!-- 分析状态提示 -->
      <div v-if="statusMessage" class="status-message" :class="statusClass">
        <el-icon class="status-icon"><component :is="statusIcon" /></el-icon>
        <span>{{ statusMessage }}</span>
      </div>
    </div>

    <!-- 分析结果展示区域 (F1026) -->
    <div v-if="currentAnalysis || isAnalyzing" class="analysis-result-panel">
      <!-- 加载状态 -->
      <div v-if="isAnalyzing" class="analysis-loading">
        <div class="loading-animation">
          <div class="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p>AI 正在分析中，请稍候...</p>
          <p class="loading-hint">基于 {{ speechCount }} 条发言记录</p>
        </div>
      </div>

      <!-- 分析结果 -->
      <div v-else-if="currentAnalysis" class="analysis-result">
        <!-- 元信息 -->
        <div class="analysis-meta">
          <div class="meta-item">
            <el-icon><Coin /></el-icon>
            <span>{{ modelText }}</span>
          </div>
          <div v-if="currentAnalysis.processingTime" class="meta-item">
            <el-icon><Timer /></el-icon>
            <span>{{ currentAnalysis.processingTime }}ms</span>
          </div>
          <div class="meta-item">
            <el-icon><CircleCheck /></el-icon>
            <span>{{ statusText }}</span>
          </div>
        </div>

        <!-- 分析结果文本 -->
        <div class="analysis-text" v-html="renderedMarkdown"></div>

        <!-- 操作按钮 -->
        <div class="analysis-actions">
          <el-button size="small" @click="handleCopy">
            <el-icon><DocumentCopy /></el-icon>
            复制
          </el-button>
          <el-button size="small" type="primary" @click="handleAnalysis">
            <el-icon><Refresh /></el-icon>
            重新生成
          </el-button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  MoreFilled,
  Coin,
  Timer,
  CircleCheck,
  DocumentCopy,
  Refresh,
} from '@element-plus/icons-vue'
import DOMPurify from 'dompurify'
import { analysisApi, type AIAnalysis, type Speech } from '@/services/api'
import { type AIModel } from '../types'

type AnalysisStatus = 'idle' | 'analyzing' | 'success' | 'error'

// 分析类型映射
const ANALYSIS_TYPE_LABELS: Record<string, string> = {
  'summary': '会议摘要',
  'action-items': '行动项',
  'sentiment': '情感分析',
  'keywords': '关键词',
  'topics': '议题分析',
  'full-report': '完整报告',
}

const props = withDefaults(
  defineProps<{
    /** 会话 ID */
    sessionId: string
    /** 发言记录列表 */
    speeches: Speech[]
    /** 是否禁用 */
    disabled?: boolean
    /** 自动生成 */
    autoGenerate?: boolean
    /** 默认分析类型 */
    defaultAnalysisType?: string
  }>(),
  {
    disabled: false,
    autoGenerate: false,
    defaultAnalysisType: 'summary',
  }
)

const emit = defineEmits<{
  (event: 'analyze', model: AIModel, analysisType: string): void
  (event: 'generated', analysis: AIAnalysis): void
  (event: 'error', error: Error): void
}>()

// 状态
const analysisStatus = ref<AnalysisStatus>('idle')
const statusMessage = ref('')
const currentAnalysis = ref<AIAnalysis | null>(null)

// 选中的值
const selectedModel = ref<AIModel>('qianwen')
const selectedAnalysisType = ref(props.defaultAnalysisType)

// 是否正在分析
const isAnalyzing = computed(() => analysisStatus.value === 'analyzing')

// 发言记录数量
const speechCount = computed(() => props.speeches.length)

// 是否可以分析
const canAnalyze = computed(() => {
  return !props.disabled && speechCount.value > 0 && !isAnalyzing.value
})

// 分析按钮图标
const analysisButtonIcon = computed(() => {
  return isAnalyzing.value ? 'Loading' : 'MagicStick'
})

// 分析按钮文字
const analysisButtonText = computed(() => {
  if (props.disabled) return '无法分析'
  if (speechCount.value === 0) return '暂无内容'
  if (isAnalyzing.value) return '分析中...'
  return '生成分析'
})

// 状态图标
const statusIcon = computed(() => {
  switch (analysisStatus.value) {
    case 'success':
      return 'CircleCheck'
    case 'error':
      return 'CircleClose'
    default:
      return 'InfoFilled'
  }
})

// 状态样式类
const statusClass = computed(() => {
  return `status-${analysisStatus.value}`
})

// 模型显示文本
const modelText = computed(() => {
  if (!currentAnalysis.value) return ''
  const modelMap: Record<string, string> = {
    'glm': '智谱 GLM-4.6V-Flash',
    'glm-4.6v-flash': '智谱 GLM-4.6V-Flash',
    'glm-4': '智谱 GLM-4.6V-Flash',
    'doubao': '豆包',
    'glm-4-flash': '智谱 GLM-4.6V-Flash',
    'qianwen': '千问',
  }
  return modelMap[currentAnalysis.value.modelUsed] || currentAnalysis.value.modelUsed
})

// 状态显示文本
const statusText = computed(() => {
  if (!currentAnalysis.value) return ''
  const statusMap: Record<string, string> = {
    pending: '等待中',
    processing: '处理中',
    completed: '已完成',
    failed: '失败',
  }
  return statusMap[currentAnalysis.value.status] || currentAnalysis.value.status
})

// 渲染的 Markdown 内容
const renderedMarkdown = computed(() => {
  if (!currentAnalysis.value) return ''
  return renderMarkdown(currentAnalysis.value.result)
})

/**
 * 简单的 Markdown 渲染（使用 DOMPurify 清理 HTML 防止 XSS）
 */
function renderMarkdown(text: string | null | undefined): string {
  const source = typeof text === 'string' ? text : ''
  const rawHtml = (
    source
      // 标题
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // 粗体和斜体
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // 列表
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      // 换行
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
  )
  // 使用 DOMPurify 清理 HTML，只保留安全的标签和属性
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'strong', 'em', 'li', 'br', 'p'],
    ALLOWED_ATTR: [],
  })
}

// 处理分析
async function handleAnalysis() {
  if (!canAnalyze.value) {
    if (speechCount.value === 0) {
      ElMessage.warning('请先开始录音并获取转写内容')
    }
    return
  }

  analysisStatus.value = 'analyzing'
  statusMessage.value = '正在分析，请稍候...'

  try {
    const response = await analysisApi.getOrCreate({
      sessionId: props.sessionId,
      speechIds: props.speeches.map((s) => s.id),
      analysisType: selectedAnalysisType.value as any,
      model: selectedModel.value,
    })

    const analysis = response.data
    if (analysis) {
      currentAnalysis.value = analysis
      analysisStatus.value = 'success'
      statusMessage.value = '分析完成'
      emit('generated', analysis)
      ElMessage.success('AI 分析生成成功')
    }
  } catch (error) {
    console.error('生成分析失败:', error)
    analysisStatus.value = 'error'
    statusMessage.value = '分析失败'
    emit('error', error as Error)
    ElMessage.error('生成分析失败')
  }

  // 3秒后重置状态消息
  setTimeout(() => {
    if (analysisStatus.value === 'success' || analysisStatus.value === 'error') {
      statusMessage.value = ''
    }
  }, 3000)
}

/**
 * 处理分析类型变化
 */
function handleTypeChange() {
  // 类型变化后清空当前结果
  if (currentAnalysis.value) {
    currentAnalysis.value = null
  }
}

/**
 * 复制分析结果（带权限回退）
 */
async function handleCopy() {
  if (!currentAnalysis.value) return

  const text = currentAnalysis.value.result

  // 尝试使用现代 Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      ElMessage.success('已复制到剪贴板')
      return
    } catch (err) {
      // 权限被拒绝或其他错误，回退到传统方法
      console.warn('Clipboard API failed, falling back:', err)
    }
  }

  // 回退方案：使用传统的 textarea 选择复制方法
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()

    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (successful) {
      ElMessage.success('已复制到剪贴板')
    } else {
      throw new Error('execCommand failed')
    }
  } catch (err) {
    console.error('Copy failed:', err)
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

/**
 * 处理导出
 */
function handleExport(command: string) {
  if (!currentAnalysis.value) {
    ElMessage.warning('请先生成分析结果')
    return
  }

  const content = currentAnalysis.value.result
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')

  switch (command) {
    case 'copy':
      handleCopy()
      break
    case 'markdown':
      downloadFile(content, `analysis-${timestamp}.md`, 'text/markdown')
      ElMessage.success('已导出 Markdown 文件')
      break
    case 'txt':
      downloadFile(content, `analysis-${timestamp}.txt`, 'text/plain')
      ElMessage.success('已导出纯文本文件')
      break
  }
}

/**
 * 下载文件
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 设置分析结果（供父组件调用）
 */
function setAnalysisResult(success: boolean, message?: string) {
  analysisStatus.value = success ? 'success' : 'error'
  statusMessage.value = message || (success ? '分析完成' : '分析失败')

  setTimeout(() => {
    if (analysisStatus.value === 'success' || analysisStatus.value === 'error') {
      analysisStatus.value = 'idle'
      statusMessage.value = ''
    }
  }, 3000)
}

/**
 * 重置组件状态
 */
function reset() {
  analysisStatus.value = 'idle'
  statusMessage.value = ''
  currentAnalysis.value = null
}

/**
 * 监听自动生成开关
 */
watch(
  () => props.autoGenerate,
  (enabled) => {
    if (enabled && speechCount.value > 0 && !currentAnalysis.value) {
      handleAnalysis()
    }
  }
)

/**
 * 监听发言记录变化
 */
watch(
  () => props.speeches.length,
  (newLength, oldLength) => {
    if (newLength > oldLength && props.autoGenerate && newLength > 0) {
      handleAnalysis()
    }
  }
)

// 暴露方法给父组件
defineExpose({
  setAnalysisResult,
  reset,
  generate: handleAnalysis,
  clear: () => {
    currentAnalysis.value = null
  },
})
</script>

<style scoped>
.ai-analysis-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--el-bg-color);
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.full-width {
  width: 100%;
}

.status-message {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.status-icon {
  flex-shrink: 0;
}

.status-idle {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.status-success {
  background-color: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.status-error {
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

/* 分析结果面板 */
.analysis-result-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--el-border-color-light);
}

/* 加载状态 */
.analysis-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.loading-animation {
  text-align: center;
}

.loading-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}

.loading-dots span {
  width: 12px;
  height: 12px;
  background-color: var(--el-color-primary);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.loading-dots span:nth-child(1) {
  animation-delay: -0.32s;
}

.loading-dots span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.loading-animation p {
  margin: 8px 0;
  color: var(--el-text-color-secondary);
}

.loading-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* 分析结果 */
.analysis-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.analysis-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-fill-color-lighter);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-item .el-icon {
  font-size: 14px;
}

.analysis-text {
  flex: 1;
  padding: 16px;
  line-height: 1.8;
  color: var(--el-text-color-primary);
  overflow-y: auto;
}

.analysis-text :deep(h1),
.analysis-text :deep(h2),
.analysis-text :deep(h3) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.analysis-text :deep(h1) {
  font-size: 20px;
  border-bottom: 2px solid var(--el-border-color-light);
  padding-bottom: 8px;
}

.analysis-text :deep(h2) {
  font-size: 18px;
}

.analysis-text :deep(h3) {
  font-size: 16px;
}

.analysis-text :deep(li) {
  margin-left: 20px;
  margin-bottom: 4px;
}

.analysis-text :deep(p) {
  margin-bottom: 12px;
}

/* 操作按钮 */
.analysis-actions {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-light);
  gap: 8px;
  flex-shrink: 0;
}

/* 响应式 */
@media (max-width: 768px) {
  .panel-header {
    padding: 8px 12px;
  }

  .panel-body {
    padding: 12px;
  }

  .analysis-meta {
    gap: 8px;
  }
}
</style>
