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
      <section v-loading="loading" class="meeting-list">
        <el-row v-if="meetings.length > 0" :gutter="16">
          <el-col
            v-for="meeting in meetings"
            :key="meeting.id"
            :xs="24"
            :sm="12"
            :md="8"
            :lg="6"
          >
            <el-card class="meeting-card" shadow="hover" @click="openMeeting(meeting.id)">
              <template #header>
                <div class="card-header">
                  <span class="meeting-title">{{ meeting.title || '未命名会议' }}</span>
                  <el-tag :type="meeting.isActive ? 'success' : 'info'" size="small">
                    {{ meeting.isActive ? '进行中' : '已结束' }}
                  </el-tag>
                </div>
              </template>
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
            </el-card>
          </el-col>
        </el-row>
        <div v-else class="empty-state">
          <el-empty description="暂无会议记录，点击右上角创建" />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { sessionApi, type Session } from '@/services/api'

const router = useRouter()
const loading = ref(false)
const meetings = ref<Session[]>([])

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
}

.meeting-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.meeting-card {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.meeting-card:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.meeting-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  background-color: #fff;
  border-radius: 8px;
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
}
</style>
