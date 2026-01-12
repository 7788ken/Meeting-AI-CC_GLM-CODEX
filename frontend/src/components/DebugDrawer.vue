<template>
  <el-drawer
    v-model="visibleProxy"
    :with-header="false"
    size="86%"
    direction="rtl"
    append-to-body
    class="debug-drawer"
    :body-class="'debug-drawer-body'"
  >
    <div class="debug-shell">
      <header class="debug-header">
        <div class="header-title">
          <div class="title">会话调试台</div>
          <div class="subtitle">Session ID: {{ sessionId || '未绑定' }}</div>
        </div>
        <div class="header-actions">
          <el-button size="small" class="ghost-button" @click="loadErrors">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          <el-button size="small" class="ghost-button" @click="visibleProxy = false">
            关闭
          </el-button>
        </div>
      </header>

      <div class="debug-body">
        <section class="panel error-list-panel">
          <div class="panel-top">
            <div class="panel-title">报错列表</div>
            <div class="panel-meta">
              <span>共 {{ errors.length }} 条</span>
              <span v-if="lastUpdated">更新于 {{ formatTimestamp(lastUpdated) }}</span>
            </div>
          </div>
          <div class="panel-content" v-loading="loading">
            <div v-if="!loading && errors.length === 0" class="empty-block">
              <el-empty description="当前会话暂无报错" :image-size="100" />
            </div>
            <div v-else class="error-list">
              <button
                v-for="(error, index) in errors"
                :key="error.id"
                type="button"
                :class="['error-card', { active: error.id === selectedId }]"
                :style="{ animationDelay: `${index * 40}ms` }"
                @click="selectError(error.id)"
              >
                <div class="error-meta">
                  <span :class="['level-tag', levelClass(error.level)]">
                    {{ levelLabel(error.level) }}
                  </span>
                  <span class="error-time">{{ formatTimestamp(error.occurredAt || error.createdAt) }}</span>
                </div>
                <div class="error-title">{{ error.message }}</div>
                <div class="error-sub">
                  <span>{{ error.source || '未知来源' }}</span>
                  <span v-if="error.category">· {{ error.category }}</span>
                </div>
              </button>
            </div>
          </div>
        </section>

        <section class="panel error-detail-panel">
          <div class="panel-top">
            <div class="panel-title">错误详情</div>
            <div class="panel-meta">
              <span v-if="activeError">ID: {{ activeError.id }}</span>
            </div>
          </div>
          <div class="panel-content detail-content">
            <div v-if="activeError" class="detail-stack">
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="detail-label">级别</span>
                  <span :class="['level-tag', levelClass(activeError.level)]">
                    {{ levelLabel(activeError.level) }}
                  </span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">发生时间</span>
                  <span>{{ formatTimestamp(activeError.occurredAt || activeError.createdAt) }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">来源</span>
                  <span>{{ activeError.source || '未知' }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">分类</span>
                  <span>{{ activeError.category || '未分类' }}</span>
                </div>
                <div class="detail-item" v-if="activeError.errorCode">
                  <span class="detail-label">错误码</span>
                  <span>{{ activeError.errorCode }}</span>
                </div>
              </div>

              <div class="detail-block">
                <div class="detail-title">错误信息</div>
                <pre class="detail-code">{{ activeError.message }}</pre>
              </div>

              <div v-if="activeError.stack" class="detail-block">
                <div class="detail-title">堆栈</div>
                <pre class="detail-code">{{ activeError.stack }}</pre>
              </div>

              <div v-if="activeError.context" class="detail-block">
                <div class="detail-title">上下文</div>
                <pre class="detail-code">{{ formatContext(activeError.context) }}</pre>
              </div>
            </div>
            <div v-else class="empty-detail">
              <div class="empty-title">选择一条报错查看详情</div>
              <div class="empty-hint">左侧列表支持快速定位最新异常</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { debugErrorApi, type DebugError } from '@/services/api'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    sessionId?: string
  }>(),
  {
    sessionId: '',
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const visibleProxy = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const errors = ref<DebugError[]>([])
const loading = ref(false)
const selectedId = ref('')
const lastUpdated = ref('')

const activeError = computed(() => {
  if (selectedId.value) {
    return errors.value.find(item => item.id === selectedId.value) || null
  }
  return errors.value[0] || null
})

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      loadErrors()
    }
  }
)

watch(
  () => props.sessionId,
  (next, prev) => {
    if (next && next !== prev && props.modelValue) {
      loadErrors()
    }
  }
)

async function loadErrors() {
  if (!props.sessionId) {
    errors.value = []
    selectedId.value = ''
    return
  }

  try {
    loading.value = true
    const response = await debugErrorApi.listBySession(props.sessionId)
    errors.value = response.data || []
    selectedId.value = errors.value[0]?.id || ''
    lastUpdated.value = new Date().toISOString()
  } catch (error) {
    console.error('加载调试错误失败:', error)
    ElMessage.error('加载调试错误失败')
  } finally {
    loading.value = false
  }
}

function selectError(id: string) {
  selectedId.value = id
}

function formatTimestamp(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function levelLabel(level?: DebugError['level']) {
  const map: Record<string, string> = {
    info: '信息',
    warn: '警告',
    error: '错误',
    fatal: '致命',
  }
  return map[level || 'error'] || '错误'
}

function levelClass(level?: DebugError['level']) {
  const map: Record<string, string> = {
    info: 'level-info',
    warn: 'level-warn',
    error: 'level-error',
    fatal: 'level-fatal',
  }
  return map[level || 'error'] || 'level-error'
}

function formatContext(context: DebugError['context']) {
  if (context == null) return ''
  if (typeof context === 'string') return context
  try {
    return JSON.stringify(context, null, 2)
  } catch {
    return String(context)
  }
}
</script>

<style scoped>
:deep(.debug-drawer) {
  background: transparent;
  --el-drawer-padding-primary: 0px;
}

:deep(.debug-drawer.el-drawer) {
  padding: 0 !important;
}

:deep(.debug-drawer .el-drawer__container) {
  padding: 0 !important;
  background: transparent;
}

:global(.debug-drawer-body) {
  padding: 0 !important;
  background: transparent;
}

.debug-shell {
  --debug-bg: #f7f2ea;
  --debug-ink: #1d1b16;
  --debug-muted: #635a4a;
  --debug-accent: #f28c38;
  --debug-accent-soft: #fff1e2;
  --debug-panel: #fffdf9;
  --debug-border: rgba(120, 108, 92, 0.25);
  --debug-shadow: 0 12px 30px rgba(28, 24, 18, 0.12);
  height: 100%;
  color: var(--debug-ink);
  font-family: 'IBM Plex Sans', 'Source Han Sans SC', 'PingFang SC', sans-serif;
  background:
    radial-gradient(circle at 15% 20%, rgba(242, 140, 56, 0.12), transparent 55%),
    radial-gradient(circle at 85% 15%, rgba(84, 128, 141, 0.14), transparent 50%),
    repeating-linear-gradient(120deg, rgba(93, 83, 72, 0.04) 0px, rgba(93, 83, 72, 0.04) 1px, transparent 1px, transparent 16px),
    var(--debug-bg);
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px 12px;
}

.header-title .title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.header-title .subtitle {
  margin-top: 6px;
  font-size: 12px;
  color: var(--debug-muted);
  font-family: 'IBM Plex Mono', 'JetBrains Mono', 'Menlo', monospace;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.ghost-button {
  border: 1px solid var(--debug-border);
  background: rgba(255, 255, 255, 0.7);
  color: var(--debug-ink);
}

.ghost-button:hover {
  border-color: var(--debug-accent);
  color: #b3541e;
}

.debug-body {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 18px;
  padding: 0 24px 24px;
  height: calc(100vh - 96px);
}

.panel {
  display: flex;
  flex-direction: column;
  background: var(--debug-panel);
  border: 1px solid var(--debug-border);
  border-radius: 18px;
  box-shadow: var(--debug-shadow);
  overflow: hidden;
}

.panel-top {
  padding: 14px 18px;
  border-bottom: 1px solid var(--debug-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.8);
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
}

.panel-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--debug-muted);
}

.panel-content {
  padding: 12px 14px;
  flex: 1;
  overflow: hidden;
}

.error-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  height: 100%;
  padding-right: 6px;
}

.error-card {
  text-align: left;
  border: 1px solid transparent;
  background: #fff;
  padding: 12px 12px 10px;
  border-radius: 14px;
  box-shadow: 0 6px 16px rgba(33, 28, 22, 0.08);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  animation: fade-in 0.4s ease forwards;
  opacity: 0;
}

.error-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(33, 28, 22, 0.12);
}

.error-card.active {
  border-color: var(--debug-accent);
  background: var(--debug-accent-soft);
}

.error-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--debug-muted);
}

.error-time {
  font-family: 'IBM Plex Mono', 'JetBrains Mono', 'Menlo', monospace;
}

.error-title {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--debug-ink);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.error-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--debug-muted);
  display: flex;
  gap: 6px;
}

.level-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}

.level-info {
  background: rgba(94, 143, 170, 0.12);
  color: #3c6a82;
  border-color: rgba(94, 143, 170, 0.3);
}

.level-warn {
  background: rgba(242, 178, 63, 0.16);
  color: #b16912;
  border-color: rgba(242, 178, 63, 0.4);
}

.level-error {
  background: rgba(219, 90, 76, 0.14);
  color: #b33d35;
  border-color: rgba(219, 90, 76, 0.35);
}

.level-fatal {
  background: rgba(67, 35, 30, 0.16);
  color: #612019;
  border-color: rgba(67, 35, 30, 0.4);
}

.detail-content {
  overflow-y: auto;
  padding-right: 6px;
}

.detail-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
  font-size: 12px;
  color: var(--debug-muted);
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.detail-block {
  margin-bottom: 16px;
}

.detail-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--debug-ink);
  margin-bottom: 6px;
}

.detail-code {
  background: #11100e;
  color: #f5efe6;
  border-radius: 12px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.5;
  font-family: 'IBM Plex Mono', 'JetBrains Mono', 'Menlo', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.empty-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  color: var(--debug-muted);
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--debug-ink);
}

.empty-hint {
  margin-top: 6px;
  font-size: 12px;
}

.empty-block {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1024px) {
  .debug-body {
    grid-template-columns: 1fr;
    height: auto;
  }
}

@media (max-width: 768px) {
  :deep(.debug-drawer) {
    width: 100% !important;
  }

  .debug-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
