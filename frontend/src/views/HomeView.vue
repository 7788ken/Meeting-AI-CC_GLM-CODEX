<template>
  <div class="home-container">
    <header class="home-header">
      <div class="header-left">
        <h1 class="app-title">AI会议助手</h1>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="createMeeting">+ 创建新会议</el-button>
      </div>
    </header>

    <main class="home-main">
      <section class="meeting-list">
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
                  <span class="meeting-title">{{ meeting.title }}</span>
                  <el-tag :type="meeting.status === 'ongoing' ? 'success' : 'info'" size="small">
                    {{ meeting.status === 'ongoing' ? '进行中' : '已结束' }}
                  </el-tag>
                </div>
              </template>
              <div class="card-item">
                <span class="card-label">创建时间</span>
                <span class="card-value">{{ formatDate(meeting.createdAt) }}</span>
              </div>
              <div class="card-item">
                <span class="card-label">持续时长</span>
                <span class="card-value">{{ formatDuration(meeting.durationMinutes) }}</span>
              </div>
              <div class="card-item">
                <span class="card-label">参会人数</span>
                <span class="card-value">{{ meeting.participants }} 人</span>
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
import { ref } from 'vue'
import { useRouter } from 'vue-router'

type MeetingStatus = 'ongoing' | 'ended'

interface MeetingSummary {
  id: string
  title: string
  createdAt: Date
  durationMinutes: number
  participants: number
  status: MeetingStatus
}

const router = useRouter()

const meetings = ref<MeetingSummary[]>([])

function createMeeting() {
  router.push('/meeting/new')
}

function openMeeting(id: string) {
  router.push(`/meeting/${id}`)
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(minutes, 0)
  const hours = Math.floor(safeMinutes / 60)
  const remaining = safeMinutes % 60
  if (hours > 0) return `${hours}小时${remaining}分钟`
  return `${remaining}分钟`
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
