<template>
  <div class="home-container">
    <header class="home-header">
      <div class="header-left">
        <h1 class="app-title">AI会议助手</h1>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="createMeeting" :loading="loading">
          + 创建新会议
        </el-button>
      </div>
    </header>

    <main class="home-main">
      <!-- 分类标签页 -->
      <el-tabs v-model="activeTab" class="meeting-tabs" @tab-change="handleTabChange">
        <el-tab-pane label="正在进行" name="active">
          <span slot="label">
            正在进行
            <el-badge v-if="activeCount > 0" :value="activeCount" class="tab-badge" />
          </span>
        </el-tab-pane>
        <el-tab-pane label="已结束" name="ended">
          <span slot="label">
            已结束
            <el-badge v-if="endedCount > 0" :value="endedCount" class="tab-badge" />
          </span>
        </el-tab-pane>
        <el-tab-pane label="存档" name="archived">
          <span slot="label">
            存档
            <el-badge v-if="archivedCount > 0" :value="archivedCount" class="tab-badge" />
          </span>
        </el-tab-pane>
      </el-tabs>

      <!-- 会议列表 -->
      <section v-loading="loading" class="meeting-list">
        <el-row v-if="filteredMeetings.length > 0" :gutter="16">
          <el-col
            v-for="meeting in filteredMeetings"
            :key="meeting.id"
            :xs="24"
            :sm="12"
            :md="8"
            :lg="6"
          >
            <el-card class="meeting-card" shadow="hover">
              <!-- 卡片头部（点击标题进入会议详情） -->
              <template #header>
                <div class="card-header" @click="openMeeting(meeting.id)">
                  <span class="meeting-title">{{ meeting.title || '未命名会议' }}</span>
                  <el-tag
                    :type="getMeetingStatusType(meeting)"
                    size="small"
                  >
                    {{ getMeetingStatusText(meeting) }}
                  </el-tag>
                </div>
              </template>

              <!-- 卡片内容 -->
              <div class="card-content" @click="openMeeting(meeting.id)">
                <div class="card-item">
                  <span class="card-label">开始时间</span>
                  <span class="card-value">{{ formatDate(meeting.startedAt) }}</span>
                </div>
                <div class="card-item">
                  <span class="card-label">持续时长</span>
                  <span class="card-value">{{ formatDuration(meeting.duration) }}</span>
                </div>
                <div v-if="meeting.endedAt" class="card-item">
                  <span class="card-label">结束时间</span>
                  <span class="card-value">{{ formatDate(meeting.endedAt) }}</span>
                </div>
              </div>

              <!-- 操作按钮区域 -->
              <div class="card-actions">
                <!-- 正在进行的会议：显示结束按钮 -->
                <el-button
                  v-if="activeTab === 'active'"
                  type="warning"
                  size="small"
                  @click.stop="handleEnd(meeting.id)"
                  :loading="actionLoading[meeting.id]"
                >
                  结束
                </el-button>
                <!-- 已结束的会议：显示存档和删除按钮 -->
                <template v-else-if="activeTab === 'ended'">
                  <el-button
                    type="primary"
                    size="small"
                    @click.stop="handleArchive(meeting.id)"
                    :loading="actionLoading[meeting.id]"
                  >
                    存档
                  </el-button>
                  <el-button
                    type="danger"
                    size="small"
                    @click.stop="handleDelete(meeting.id)"
                    :loading="actionLoading[meeting.id]"
                  >
                    删除
                  </el-button>
                </template>
                <!-- 已存档的会议：显示取消存档和删除按钮 -->
                <template v-else-if="activeTab === 'archived'">
                  <el-button
                    type="info"
                    size="small"
                    @click.stop="handleUnarchive(meeting.id)"
                    :loading="actionLoading[meeting.id]"
                  >
                    取消存档
                  </el-button>
                  <el-button
                    type="danger"
                    size="small"
                    @click.stop="handleDelete(meeting.id)"
                    :loading="actionLoading[meeting.id]"
                  >
                    删除
                  </el-button>
                </template>
              </div>
            </el-card>
          </el-col>
        </el-row>
        <div v-else class="empty-state">
          <el-empty :description="emptyDescription" />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sessionApi, type Session } from '@/services/api'

const router = useRouter()
const loading = ref(false)
const meetings = ref<Session[]>([])
const activeTab = ref<'active' | 'ended' | 'archived'>('active')
const actionLoading = ref<Record<string, boolean>>({})

// 根据当前标签页过滤会议
const filteredMeetings = computed(() => {
  return meetings.value.filter(meeting => {
    if (activeTab.value === 'active') {
      return !meeting.endedAt && !meeting.isArchived
    } else if (activeTab.value === 'ended') {
      return !!meeting.endedAt && !meeting.isArchived
    } else {
      return meeting.isArchived
    }
  })
})

// 统计各类型会议数量
const activeCount = computed(() =>
  meetings.value.filter(m => !m.endedAt && !m.isArchived).length
)
const endedCount = computed(() =>
  meetings.value.filter(m => !!m.endedAt && !m.isArchived).length
)
const archivedCount = computed(() =>
  meetings.value.filter(m => m.isArchived).length
)

// 空状态描述
const emptyDescription = computed(() => {
  switch (activeTab.value) {
    case 'active':
      return '暂无正在进行的会议'
    case 'ended':
      return '暂无已结束的会议'
    case 'archived':
      return '暂无存档的会议'
    default:
      return '暂无会议记录'
  }
})

onMounted(() => {
  loadMeetings()
})

async function loadMeetings() {
  loading.value = true
  try {
    const response = await sessionApi.list()
    meetings.value = response.data || []
  } catch (error) {
    console.error('加载会议列表失败:', error)
    ElMessage.error('加载会议列表失败')
  } finally {
    loading.value = false
  }
}

async function createMeeting() {
  loading.value = true
  try {
    const response = await sessionApi.create({
      title: `会议 ${new Date().toLocaleString()}`,
    })
    const sessionId = response.data?.id
    if (sessionId) {
      ElMessage.success('会议创建成功')
      router.push(`/meeting/${sessionId}`)
    } else {
      ElMessage.error('创建会议失败: 未返回会话ID')
    }
  } catch (error) {
    console.error('创建会议失败:', error)
    ElMessage.error('创建会议失败')
  } finally {
    loading.value = false
  }
}

function openMeeting(id: string) {
  router.push(`/meeting/${id}`)
}

function handleTabChange(tabName: string) {
  activeTab.value = tabName as 'active' | 'ended' | 'archived'
}

async function handleEnd(sessionId: string) {
  try {
    await ElMessageBox.confirm('确定要结束此会议吗？', '确认操作', {
      type: 'warning',
    })
    setActionLoading(sessionId, true)
    await sessionApi.end(sessionId)
    ElMessage.success('会议已结束')
    await loadMeetings()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('结束会议失败:', error)
      ElMessage.error('结束会议失败')
    }
  } finally {
    setActionLoading(sessionId, false)
  }
}

async function handleArchive(sessionId: string) {
  try {
    await ElMessageBox.confirm('确定要存档此会议吗？存档后会议将移至存档列表。', '确认存档', {
      type: 'info',
    })
    setActionLoading(sessionId, true)
    await sessionApi.archive(sessionId)
    ElMessage.success('会议已存档')
    await loadMeetings()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('存档会议失败:', error)
      ElMessage.error('存档会议失败')
    }
  } finally {
    setActionLoading(sessionId, false)
  }
}

async function handleUnarchive(sessionId: string) {
  try {
    await ElMessageBox.confirm('确定要取消存档吗？会议将移回已结束列表。', '确认操作', {
      type: 'info',
    })
    setActionLoading(sessionId, true)
    await sessionApi.unarchive(sessionId)
    ElMessage.success('已取消存档')
    await loadMeetings()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('取消存档失败:', error)
      ElMessage.error('取消存档失败')
    }
  } finally {
    setActionLoading(sessionId, false)
  }
}

async function handleDelete(sessionId: string) {
  try {
    await ElMessageBox.confirm('删除后无法恢复，确定要删除此会议吗？', '确认删除', {
      type: 'error',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
    })
    setActionLoading(sessionId, true)
    await sessionApi.remove(sessionId)
    ElMessage.success('会议已删除')
    await loadMeetings()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除会议失败:', error)
      ElMessage.error('删除会议失败')
    }
  } finally {
    setActionLoading(sessionId, false)
  }
}

function setActionLoading(sessionId: string, isLoading: boolean) {
  actionLoading.value = { ...actionLoading.value, [sessionId]: isLoading }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function formatDuration(milliseconds: number | null): string {
  if (!milliseconds) return '-'
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}小时${minutes % 60}分钟`
  if (minutes > 0) return `${minutes}分钟`
  return `${seconds}秒`
}

function getMeetingStatusType(meeting: Session): 'success' | 'info' | 'warning' {
  if (meeting.isArchived) return 'info'
  if (!meeting.endedAt) return 'success'
  return 'info'
}

function getMeetingStatusText(meeting: Session): string {
  if (meeting.isArchived) return '已存档'
  if (!meeting.endedAt) return '进行中'
  return '已结束'
}
</script>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.home-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background-color: #fff;
  border-bottom: 1px solid #e8e8e8;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
}

.app-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1890ff;
}

.home-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  max-height: calc(100vh - 60px);
}

.meeting-tabs {
  background-color: #fff;
  padding: 0 16px;
  border-radius: 8px 8px 0 0;
}

.tab-badge {
  margin-left: 8px;
}

.meeting-list {
  background-color: #fff;
  padding: 16px;
  border-radius: 0 0 8px 8px;
  min-height: 300px;
}

.meeting-card {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.meeting-card:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}

.meeting-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.card-content {
  flex: 1;
  cursor: pointer;
}

.card-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}

.card-label {
  color: #999;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

@media (max-width: 768px) {
  .home-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-right {
    width: 100%;
    justify-content: flex-end;
  }

  .card-actions {
    flex-direction: column;
  }

  .card-actions .el-button {
    width: 100%;
  }
}
</style>
