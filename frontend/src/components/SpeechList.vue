<template>
  <div class="speech-list">
    <div class="list-header">
      <div class="header-left">
        <h3 class="list-title">发言列表</h3>
        <span class="list-count">({{ displaySpeeches.length }}/{{ speeches.length }})</span>
      </div>
      <div class="header-actions">
        <el-button
          v-if="showMarkedOnly"
          size="small"
          type="warning"
          :icon="StarFilled"
          @click="toggleMarkedFilter"
        >
          已标记 ({{ markedCount }})
        </el-button>
        <el-button
          v-else
          size="small"
          :icon="Star"
          @click="toggleMarkedFilter"
        >
          标记筛选
        </el-button>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索发言内容..."
        :prefix-icon="Search"
        clearable
        size="small"
      />
      <div v-if="searchKeyword" class="search-info">
        找到 {{ displaySpeeches.length }} 条结果
      </div>
    </div>

    <div ref="listRef" class="list-content" @scroll="handleScroll">
      <div
        v-for="speech in displaySpeeches"
        :key="speech.id"
        :class="['list-item', { selected: speech.id === selectedId, marked: speech.isMarked }]"
        :style="{ borderLeftColor: speech.speakerColor }"
        @click="handleSelect(speech.id)"
      >
        <div class="item-header">
          <span
            class="speaker-badge"
            :style="{ backgroundColor: speech.speakerColor || '#1890ff' }"
          >
            {{ speech.speakerName }}
          </span>
          <span class="item-time">{{ formatTime(speech.startTime) }}</span>
        </div>

        <div class="item-content">
          <span v-html="highlightContent(speech.content)"></span>
        </div>

        <div
          class="mark-indicator"
          :class="{ active: speech.isMarked }"
          @click.stop="toggleMark(speech.id)"
        >
          <el-icon><StarFilled v-if="speech.isMarked" /><Star v-else /></el-icon>
        </div>
      </div>

      <div v-if="displaySpeeches.length === 0" class="empty-state">
        <el-empty description="暂无发言记录" :image-size="80" />
      </div>
    </div>

    <div v-if="!isAtBottom && speeches.length > 0" class="scroll-hint">
      <el-button size="small" circle @click="scrollToBottom">
        <el-icon><Bottom /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Bottom, StarFilled, Star, Search } from '@element-plus/icons-vue'
import type { Speech } from '@/services/api'

const props = withDefaults(
  defineProps<{
    speeches: Speech[]
    maxContentLength?: number
  }>(),
  {
    maxContentLength: 50,
  },
)

const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'toggleMark', id: string): void
}>()

const listRef = ref<HTMLElement>()
const selectedId = ref<string>('')
const isAtBottom = ref(true)
const searchKeyword = ref('')
const showMarkedOnly = ref(false)

/**
 * 已标记数量
 */
const markedCount = computed(() => props.speeches.filter(s => s.isMarked).length)

/**
 * 过滤后的发言列表
 */
const filteredSpeeches = computed(() => {
  let result = [...props.speeches]

  // 标记筛选
  if (showMarkedOnly.value) {
    result = result.filter(s => s.isMarked)
  }

  // 关键词搜索
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(s =>
      s.content.toLowerCase().includes(keyword) ||
      s.speakerName.toLowerCase().includes(keyword)
    )
  }

  return result
})

/**
 * 显示的发言列表
 */
const displaySpeeches = computed(() => filteredSpeeches.value)

/**
 * 高亮搜索关键词
 */
function highlightContent(content: string): string {
  const truncated = truncateContent(content)
  if (!searchKeyword.value.trim()) {
    return truncated
  }

  const keyword = searchKeyword.value.trim()
  const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi')
  return truncated.replace(regex, '<mark>$1</mark>')
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 切换标记状态
 */
function toggleMark(id: string) {
  emit('toggleMark', id)
}

/**
 * 切换标记筛选
 */
function toggleMarkedFilter() {
  showMarkedOnly.value = !showMarkedOnly.value
}

/**
 * 截断内容预览
 */
function truncateContent(content: string): string {
  if (content.length <= props.maxContentLength) {
    return content
  }
  return content.slice(0, props.maxContentLength) + '...'
}

/**
 * 格式化时间
 */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * 处理选择发言
 */
function handleSelect(id: string) {
  selectedId.value = id
  emit('select', id)
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
      isAtBottom.value = true
    }
  })
}

/**
 * 监听列表滚动
 */
function handleScroll() {
  if (!listRef.value) return

  const { scrollTop, scrollHeight, clientHeight } = listRef.value
  const distanceToBottom = scrollHeight - scrollTop - clientHeight
  isAtBottom.value = distanceToBottom < 20
}

/**
 * 监听发言记录变化
 */
watch(
  () => props.speeches.length,
  () => {
    if (isAtBottom.value) {
      scrollToBottom()
    }
  },
)

// 暴露方法
defineExpose({
  scrollToBottom,
  selectFirst: () => {
    if (props.speeches.length > 0) {
      handleSelect(props.speeches[0].id)
    }
  },
})
</script>

<style scoped>
.speech-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--el-bg-color);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.search-bar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.search-info {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.list-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.list-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.list-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.list-item {
  position: relative;
  padding: 10px 12px;
  margin-bottom: 8px;
  border-left: 3px solid;
  background-color: var(--el-fill-color-lighter);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.list-item:hover {
  background-color: var(--el-fill-color-light);
}

.list-item.selected {
  background-color: var(--el-color-primary-light-9);
  border-left-width: 4px;
}

.list-item.marked {
  background-color: var(--el-color-warning-light-9);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.speaker-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #fff;
  font-weight: 500;
}

.item-time {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.item-content {
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.mark-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px;
  border-radius: 4px;
  color: var(--el-text-color-placeholder);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mark-indicator:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-warning);
}

.mark-indicator.active {
  color: var(--el-color-warning);
}

/* 搜索高亮样式 */
.item-content :deep(mark) {
  background-color: var(--el-color-warning-light-7);
  color: var(--el-color-warning-dark-2);
  padding: 0 2px;
  border-radius: 2px;
  font-weight: 500;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
}

.scroll-hint {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 10;
}

/* 滚动条样式 */
.list-content::-webkit-scrollbar {
  width: 6px;
}

.list-content::-webkit-scrollbar-track {
  background: transparent;
}

.list-content::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker);
  border-radius: 3px;
}

.list-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-border-color-dark);
}
</style>
