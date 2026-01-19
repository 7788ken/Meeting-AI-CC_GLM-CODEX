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
	          <el-button
	            v-if="activeTab === 'errors'"
	            size="small"
	            class="ghost-button danger-button"
	            :disabled="!sessionId || clearing"
	            :loading="clearing"
	            @click="clearErrors"
	          >
	            <el-icon><Delete /></el-icon>
	            清空报错
	          </el-button>
	          <el-button
	            v-if="activeTab !== 'errors'"
	            size="small"
	            class="ghost-button danger-button"
	            :disabled="!sessionId || logsLoading"
	            :loading="logsLoading"
	            @click="clearLogs"
	          >
	            清空日志
	          </el-button>
	          <el-button size="small" class="ghost-button" @click="handleRefresh">
	            <el-icon><Refresh /></el-icon>
	            刷新
	          </el-button>
          <el-button size="small" class="ghost-button" @click="visibleProxy = false">
            关闭
          </el-button>
        </div>
      </header>

      <el-tabs v-model="activeTab" class="debug-tabs">
        <el-tab-pane name="errors" label="报错列表">
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

		              <div v-if="glmSnippetText" class="detail-block">
		                <div class="detail-title">GLM 返回</div>
		                <pre class="detail-code">{{ glmSnippetText }}</pre>
		              </div>

		              <div v-if="promptSnippetText" class="detail-block">
		                <div class="detail-title">LLM 提示词</div>
		                <pre class="detail-code">{{ promptSnippetText }}</pre>
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
        </el-tab-pane>

        <el-tab-pane
          v-for="tab in logTabs"
          :key="tab.name"
          :name="tab.name"
          :label="tab.label"
        >
          <div class="debug-body">
            <section class="panel log-list-panel">
              <div class="panel-top">
                <div class="panel-title">{{ tab.label }}</div>
                <div class="panel-meta">
                  <span>共 {{ getFilteredLogs(tab.type).length }} 条</span>
                  <span v-if="logsUpdatedAt[tab.type]">
                    更新于 {{ formatTimestamp(logsUpdatedAt[tab.type]) }}
                  </span>
                </div>
              </div>
              <div class="panel-content" v-loading="logsLoading">
                <div class="log-filters">
                  <el-select
                    v-model="logFilters[tab.type].selected"
                    multiple
                    collapse-tags
                    collapse-tags-tooltip
                    clearable
                    filterable
                    placeholder="过滤项目"
                    class="log-filter-select"
                  >
                    <el-option-group
                      v-for="group in getLogFilterOptions(tab.type)"
                      :key="group.label"
                      :label="group.label"
                    >
                      <el-option
                        v-for="option in group.options"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </el-option-group>
                  </el-select>
                  <el-input
                    v-model="logFilters[tab.type].keyword"
                    clearable
                    placeholder="搜索内容/接口"
                    class="log-filter-input"
                  />
                </div>
                <div v-if="!logsLoading && getFilteredLogs(tab.type).length === 0" class="empty-block">
                  <el-empty description="当前会话暂无日志" :image-size="100" />
                </div>
                <div v-else class="log-list">
                  <button
                    v-for="(log, index) in getFilteredLogs(tab.type)"
                    :key="log.id"
                    type="button"
                    :class="['log-card', { active: log.id === getActiveLog(tab.type)?.id }]"
                    :style="{ animationDelay: `${index * 40}ms` }"
                    @click="selectLog(tab.type, log.id)"
                  >
                    <div class="error-meta">
                      <span :class="['level-tag', levelClass(log.level)]">
                        {{ levelLabel(log.level) }}
                      </span>
                      <span class="error-time">{{ formatTimestamp(log.createdAt) }}</span>
                    </div>
                    <div class="error-title">{{ log.message }}</div>
                    <div class="error-sub">
                      <span>{{ logTypeLabel(tab.type) }}</span>
                      <span v-if="getLogMeta(log).statusCode">· {{ getLogMeta(log).statusCode }}</span>
                    </div>
                  </button>
                </div>
              </div>
            </section>

            <section class="panel log-detail-panel">
              <div class="panel-top">
                <div class="panel-title">日志详情</div>
                <div class="panel-meta">
                  <span v-if="getActiveLog(tab.type)">ID: {{ getActiveLog(tab.type)?.id }}</span>
                </div>
              </div>
              <div class="panel-content detail-content">
                <div v-if="getActiveLog(tab.type)" class="detail-stack">
                  <div class="detail-grid">
                    <div class="detail-item">
                      <span class="detail-label">级别</span>
                      <span :class="['level-tag', levelClass(getActiveLog(tab.type)?.level)]">
                        {{ levelLabel(getActiveLog(tab.type)?.level) }}
                      </span>
                    </div>
                    <div class="detail-item">
                      <span class="detail-label">记录时间</span>
                      <span>{{ formatTimestamp(getActiveLog(tab.type)?.createdAt) }}</span>
                    </div>
                    <div class="detail-item" v-if="getLogMeta(getActiveLog(tab.type)).method">
                      <span class="detail-label">方法</span>
                      <span>{{ getLogMeta(getActiveLog(tab.type)).method }}</span>
                    </div>
                    <div class="detail-item" v-if="getLogMeta(getActiveLog(tab.type)).path">
                      <span class="detail-label">路径</span>
                      <span>{{ getLogMeta(getActiveLog(tab.type)).path }}</span>
                    </div>
                    <div class="detail-item" v-if="getLogMeta(getActiveLog(tab.type)).statusCode">
                      <span class="detail-label">状态码</span>
                      <span>{{ getLogMeta(getActiveLog(tab.type)).statusCode }}</span>
                    </div>
                    <div class="detail-item" v-if="getLogMeta(getActiveLog(tab.type)).durationMs">
                      <span class="detail-label">耗时</span>
                      <span>{{ getLogMeta(getActiveLog(tab.type)).durationMs }} ms</span>
                    </div>
                  </div>

                  <div class="detail-block">
                    <div class="detail-title">摘要</div>
                    <pre class="detail-code">{{ getActiveLog(tab.type)?.message }}</pre>
                  </div>

                  <div v-if="getActiveLog(tab.type)?.payload" class="detail-block">
                    <div class="detail-title">详情</div>
                    <pre class="detail-code">{{ formatPayload(getActiveLog(tab.type)?.payload) }}</pre>
                  </div>
                </div>
                <div v-else class="empty-detail">
                  <div class="empty-title">选择一条日志查看详情</div>
                  <div class="empty-hint">左侧列表支持快速定位最新记录</div>
                </div>
              </div>
            </section>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
		import { computed, reactive, ref, watch } from 'vue'
		import { ElMessage, ElMessageBox } from 'element-plus'
		import { Delete, Refresh } from '@element-plus/icons-vue'
		import { appLogsApi, debugErrorApi, type AppLog, type AppLogType, type DebugError } from '@/services/api'

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

	const activeTab = ref<'errors' | 'request_response' | 'error_logs' | 'system_logs'>('errors')

	const errors = ref<DebugError[]>([])
	const loading = ref(false)
	const clearing = ref(false)
	const selectedId = ref('')
	const lastUpdated = ref('')

	const logTabs = [
	  { name: 'request_response', label: '请求/回复', type: 'llm' as AppLogType },
	  { name: 'error_logs', label: '错误日志', type: 'error' as AppLogType },
	  { name: 'system_logs', label: '系统日志', type: 'system' as AppLogType },
	]

	const logsByType = reactive<Record<AppLogType, AppLog[]>>({
	  request_response: [],
	  llm: [],
	  error: [],
	  system: [],
	})
	const logsLoading = ref(false)
	const logsUpdatedAt = reactive<Record<AppLogType, string>>({
	  request_response: '',
	  llm: '',
	  error: '',
	  system: '',
	})
	const selectedLogId = reactive<Record<AppLogType, string>>({
	  request_response: '',
	  llm: '',
	  error: '',
	  system: '',
	})
	const logFilters = reactive<Record<AppLogType, { selected: string[]; keyword: string }>>({
	  request_response: { selected: [], keyword: '' },
	  llm: { selected: [], keyword: '' },
	  error: { selected: [], keyword: '' },
	  system: { selected: [], keyword: '' },
	})

const activeError = computed(() => {
  if (selectedId.value) {
    return errors.value.find(item => item.id === selectedId.value) || null
  }
  return errors.value[0] || null
})

function getActiveLog(type: AppLogType): AppLog | null {
  const filtered = getFilteredLogs(type)
  const selected = selectedLogId[type]
  if (selected) {
    return filtered.find(item => item.id === selected) || filtered[0] || null
  }
  return filtered[0] || null
}

type GlmSnippet = {
  requestId?: string
  id?: string
  model?: string
  finishReason?: string
  content?: string
}

type PromptSnippet = {
  promptLength?: number
  promptSystem?: string
  promptUser?: string
}

function extractGlmContent(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (!Array.isArray(raw)) return null
  const parts: string[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const text = (item as any).text
    if (typeof text === 'string' && text.trim()) parts.push(text)
  }
  const merged = parts.join('')
  return merged ? merged : null
}

function extractGlmSnippet(context: DebugError['context']): GlmSnippet | null {
  if (!context || typeof context !== 'object') return null
  const glm = (context as any).glm
  if (!glm || typeof glm !== 'object') return null
  const response = glm.response
  if (!response || typeof response !== 'object') return null
  const choices = (response as any).choices
  const choice = Array.isArray(choices) ? choices[0] : null
  if (!choice || typeof choice !== 'object') return null
  const message = (choice as any).message
  if (!message || typeof message !== 'object') return null

  const finishReason =
    typeof (choice as any).finish_reason === 'string' ? (choice as any).finish_reason : undefined
  const content =
    extractGlmContent((message as any).content) ??
    extractGlmContent((message as any).reasoning_content) ??
    null

  if (!content && !finishReason) return null

  return {
    requestId: typeof (response as any).request_id === 'string' ? (response as any).request_id : undefined,
    id: typeof (response as any).id === 'string' ? (response as any).id : undefined,
    model: typeof (response as any).model === 'string' ? (response as any).model : undefined,
    finishReason,
    content: content ?? undefined,
  }
}

const glmSnippetText = computed(() => {
  const snippet = extractGlmSnippet(activeError.value?.context)
  if (!snippet) return null
  try {
    return JSON.stringify(snippet, null, 2)
  } catch {
    return String(snippet)
  }
})

function extractPromptSnippet(context: DebugError['context']): PromptSnippet | null {
  if (!context || typeof context !== 'object') return null
  const promptSystem = (context as any).promptSystem
  const promptUser = (context as any).promptUser
  const promptLength = (context as any).promptLength

  const snippet: PromptSnippet = {}
  if (typeof promptLength === 'number' && Number.isFinite(promptLength)) snippet.promptLength = promptLength
  if (typeof promptSystem === 'string' && promptSystem.trim()) snippet.promptSystem = promptSystem
  if (typeof promptUser === 'string' && promptUser.trim()) snippet.promptUser = promptUser

  if (!snippet.promptSystem && !snippet.promptUser && snippet.promptLength == null) return null
  return snippet
}

const promptSnippetText = computed(() => {
  const snippet = extractPromptSnippet(activeError.value?.context)
  if (!snippet) return null
  try {
    return JSON.stringify(snippet, null, 2)
  } catch {
    return String(snippet)
  }
})

function resolveLogType(tabName: string): AppLogType | null {
  if (tabName === 'request_response') return 'llm'
  if (tabName === 'error_logs') return 'error'
  if (tabName === 'system_logs') return 'system'
  return null
}

async function refreshActiveTab(): Promise<void> {
  const logType = resolveLogType(activeTab.value)
  if (logType) {
    await loadLogs(logType)
    return
  }
  await loadErrors()
}

function handleRefresh() {
  void refreshActiveTab()
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      void refreshActiveTab()
    }
  }
)

watch(
  () => props.sessionId,
  (next, prev) => {
    if (next && next !== prev && props.modelValue) {
      void refreshActiveTab()
    }
  }
)

watch(
  () => activeTab.value,
  () => {
    if (props.modelValue) {
      void refreshActiveTab()
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

async function loadLogs(type: AppLogType) {
  if (!props.sessionId) {
    logsByType[type] = []
    selectedLogId[type] = ''
    return
  }

  try {
    logsLoading.value = true
    const limit = type === 'llm' ? 100 : 200
    const response = await appLogsApi.listBySession(props.sessionId, type, limit)
    logsByType[type] = response.data || []
    selectedLogId[type] = logsByType[type][0]?.id || ''
    logsUpdatedAt[type] = new Date().toISOString()
  } catch (error) {
    console.error('加载会话日志失败:', error)
    ElMessage.error('加载会话日志失败')
  } finally {
    logsLoading.value = false
  }
}

	async function clearErrors() {
	  const currentSessionId = props.sessionId?.trim()
	  if (!currentSessionId) return
	  if (clearing.value) return

	  try {
	    await ElMessageBox.confirm(
	      '将删除该会话所有调试报错记录（不可恢复）。确定继续吗？',
	      '清空报错确认',
	      {
	        confirmButtonText: '清空',
	        cancelButtonText: '取消',
	        type: 'warning',
	      }
	    )
	  } catch {
	    return
	  }

	  try {
	    clearing.value = true
	    const response = await debugErrorApi.clearBySession(currentSessionId)
	    const deletedCount = response.data?.deletedCount ?? 0
	    errors.value = []
	    selectedId.value = ''
	    lastUpdated.value = new Date().toISOString()
	    ElMessage.success(`已清空 ${deletedCount} 条报错`)
	  } catch (error) {
	    console.error('清空调试错误失败:', error)
	    ElMessage.error('清空调试错误失败')
	  } finally {
	    clearing.value = false
	  }
	}

async function clearLogs() {
  const currentSessionId = props.sessionId?.trim()
  if (!currentSessionId) return
  if (logsLoading.value) return

  const logType = resolveLogType(activeTab.value)
  if (!logType) return

  try {
    await ElMessageBox.confirm(
      `将删除该会话“${logTypeLabel(logType)}”记录（不可恢复）。确定继续吗？`,
      '清空日志确认',
      {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return
  }

  try {
    logsLoading.value = true
    const response = await appLogsApi.clearBySession(currentSessionId, logType)
    const deletedCount = response.data?.deletedCount ?? 0
    logsByType[logType] = []
    selectedLogId[logType] = ''
    logsUpdatedAt[logType] = new Date().toISOString()
    ElMessage.success(`已清空 ${deletedCount} 条日志`)
  } catch (error) {
    console.error('清空会话日志失败:', error)
    ElMessage.error('清空会话日志失败')
  } finally {
    logsLoading.value = false
  }
}

function selectError(id: string) {
  selectedId.value = id
}

function selectLog(type: AppLogType, id: string) {
  selectedLogId[type] = id
}

function logTypeLabel(type: AppLogType): string {
  const map: Record<AppLogType, string> = {
    request_response: '请求/回复',
    llm: 'LLM 请求/回复',
    error: '错误日志',
    system: '系统日志',
  }
  return map[type]
}

function getLogMeta(log?: AppLog | null): {
  statusCode?: number
  method?: string
  path?: string
  durationMs?: number
} {
  const payload = log?.payload as Record<string, unknown> | undefined
  const statusCode = typeof payload?.statusCode === 'number' ? payload.statusCode : undefined
  const method = typeof payload?.method === 'string' ? payload.method : undefined
  const path = typeof payload?.path === 'string' ? payload.path : undefined
  const durationMs = typeof payload?.durationMs === 'number' ? payload.durationMs : undefined
  return { statusCode, method, path, durationMs }
}

type LogFilterGroup = {
  label: string
  options: Array<{ label: string; value: string }>
}

function getLogFilterOptions(type: AppLogType): LogFilterGroup[] {
  const groups: LogFilterGroup[] = []
  groups.push({
    label: '级别',
    options: [
      { label: '信息', value: 'level:info' },
      { label: '警告', value: 'level:warn' },
      { label: '错误', value: 'level:error' },
    ],
  })

  const methods = new Set<string>()
  const statusGroups = new Set<string>()
  const models = new Set<string>()
  const labels = new Set<string>()
  for (const log of logsByType[type]) {
    const meta = getLogMeta(log)
    if (meta.method) methods.add(meta.method.toUpperCase())
    if (typeof meta.statusCode === 'number') {
      const group = `${Math.floor(meta.statusCode / 100)}xx`
      statusGroups.add(group)
    }
    const payload = log.payload as Record<string, unknown> | undefined
    const params = payload?.params as Record<string, unknown> | undefined
    const model = typeof params?.model === 'string' ? params.model.trim() : ''
    if (model) models.add(model)
    const label = typeof payload?.label === 'string' ? payload.label.trim() : ''
    if (label) labels.add(label)
  }

  if (methods.size > 0) {
    groups.push({
      label: '方法',
      options: Array.from(methods).sort().map(method => ({
        label: method,
        value: `method:${method}`,
      })),
    })
  }

  if (statusGroups.size > 0) {
    groups.push({
      label: '状态',
      options: Array.from(statusGroups)
        .sort()
        .map(group => ({
          label: group,
          value: `status:${group}`,
        })),
    })
  }

  if (models.size > 0) {
    groups.push({
      label: '模型',
      options: Array.from(models)
        .sort()
        .map(model => ({
          label: model,
          value: `model:${model}`,
        })),
    })
  }

  if (labels.size > 0) {
    groups.push({
      label: '标签',
      options: Array.from(labels)
        .sort()
        .map(label => ({
          label,
          value: `label:${label}`,
        })),
    })
  }

  return groups
}

function getFilteredLogs(type: AppLogType): AppLog[] {
  const source = logsByType[type]
  const selected = logFilters[type].selected
  const keyword = logFilters[type].keyword.trim().toLowerCase()
  if (selected.length === 0 && !keyword) return source

  const grouped = groupFilters(selected)
  return source.filter(log => {
    if (!matchesLogFilters(log, grouped)) return false
    if (!keyword) return true
    return getLogSearchText(log).includes(keyword)
  })
}

function groupFilters(selected: string[]): Record<'level' | 'method' | 'status' | 'model' | 'label', string[]> {
  const grouped: Record<'level' | 'method' | 'status' | 'model' | 'label', string[]> = {
    level: [],
    method: [],
    status: [],
    model: [],
    label: [],
  }
  for (const item of selected) {
    const [kind, value] = item.split(':')
    if (kind === 'level' || kind === 'method' || kind === 'status' || kind === 'model' || kind === 'label') {
      grouped[kind].push(value)
    }
  }
  return grouped
}

function matchesLogFilters(
  log: AppLog,
  filters: Record<'level' | 'method' | 'status' | 'model' | 'label', string[]>
): boolean {
  const levelMatches = filters.level.length === 0 || filters.level.includes(log.level)
  const meta = getLogMeta(log)
  const methodMatches =
    filters.method.length === 0 ||
    (meta.method ? filters.method.includes(meta.method.toUpperCase()) : false)
  const statusGroup = typeof meta.statusCode === 'number'
    ? `${Math.floor(meta.statusCode / 100)}xx`
    : ''
  const statusMatches = filters.status.length === 0 || (statusGroup ? filters.status.includes(statusGroup) : false)
  const payload = log.payload as Record<string, unknown> | undefined
  const params = payload?.params as Record<string, unknown> | undefined
  const model = typeof params?.model === 'string' ? params.model.trim() : ''
  const modelMatches = filters.model.length === 0 || (model ? filters.model.includes(model) : false)
  const label = typeof payload?.label === 'string' ? payload.label.trim() : ''
  const labelMatches = filters.label.length === 0 || (label ? filters.label.includes(label) : false)
  return levelMatches && methodMatches && statusMatches && modelMatches && labelMatches
}

function getLogSearchText(log: AppLog): string {
  const meta = getLogMeta(log)
  const payload = log.payload as Record<string, unknown> | undefined
  const params = payload?.params as Record<string, unknown> | undefined
  const model = typeof params?.model === 'string' ? params.model : ''
  const label = typeof payload?.label === 'string' ? payload.label : ''
  const segments = [
    log.message,
    meta.method,
    meta.path,
    typeof meta.statusCode === 'number' ? String(meta.statusCode) : '',
    model,
    label,
    safeStringify(log.payload),
  ]
  return segments.filter(Boolean).join(' ').toLowerCase()
}

function safeStringify(value?: Record<string, unknown>): string {
  if (!value) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
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

function levelLabel(level?: string) {
  const map: Record<string, string> = {
    info: '信息',
    warn: '警告',
    error: '错误',
    fatal: '致命',
  }
  return map[level || 'error'] || '错误'
}

function levelClass(level?: string) {
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

function formatPayload(payload?: Record<string, unknown>) {
  if (!payload) return ''
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
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
  display: flex;
  flex-direction: column;
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

	.danger-button:hover {
	  border-color: rgba(219, 90, 76, 0.6);
	  color: #b33d35;
	}

.debug-tabs {
  display: flex;
  flex-direction: column;
  padding: 0 24px 24px;
  height: calc(100vh - 96px);
  flex: 1;
  min-height: 0;
}

:deep(.debug-tabs .el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.debug-tabs .el-tab-pane) {
  height: 100%;
}

.debug-body {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 18px;
  height: 100%;
  min-height: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  background: var(--debug-panel);
  border: 1px solid var(--debug-border);
  border-radius: 18px;
  box-shadow: var(--debug-shadow);
  overflow: hidden;
  min-height: 0;
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
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.log-filters {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.log-filter-select {
  flex: 1;
  min-width: 180px;
}

.log-filter-input {
  flex: 1;
  min-width: 180px;
}

.error-list,
.log-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  height: 100%;
  flex: 1;
  min-height: 0;
  padding-right: 6px;
}

.error-card,
.log-card {
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

.error-card:hover,
.log-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(33, 28, 22, 0.12);
}

.error-card.active,
.log-card.active {
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
  min-height: 0;
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

  .debug-tabs {
    height: auto;
    overflow-y: auto;
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

  .log-filters {
    flex-direction: column;
  }
}
</style>
