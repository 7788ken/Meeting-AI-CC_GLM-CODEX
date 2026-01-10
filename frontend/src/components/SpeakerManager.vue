<template>
  <div class="speaker-manager">
    <div class="panel-header">
      <h3 class="panel-title">发言者管理</h3>
      <el-button type="primary" size="small" @click="handleAddSpeaker">
        <el-icon><Plus /></el-icon>
        添加发言者
      </el-button>
    </div>

    <div class="speaker-list">
      <div
        v-for="speaker in speakers"
        :key="speaker.id"
        :class="['speaker-item', { selected: selectedSpeakerId === speaker.id }]"
        @click="handleSelectSpeaker(speaker.id)"
      >
        <div class="speaker-avatar">
          <img
            v-if="speaker.avatarUrl"
            :src="speaker.avatarUrl"
            :alt="speaker.name"
            class="avatar-img"
          />
          <div v-else class="avatar-placeholder" :style="{ backgroundColor: speaker.color }">
            {{ speaker.name.charAt(0).toUpperCase() }}
          </div>
        </div>

        <div class="speaker-info">
          <div class="speaker-name">{{ speaker.name }}</div>
          <div class="speaker-stats">
            <span class="stat-item">{{ getSpeakerSpeechCount(speaker.id) }} 条发言</span>
          </div>
        </div>

        <div class="speaker-actions">
          <el-dropdown trigger="click" @command="(cmd: string) => handleCommand(cmd, speaker)">
            <el-button size="small" circle text>
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="edit">
                  <el-icon><Edit /></el-icon>
                  编辑
                </el-dropdown-item>
                <el-dropdown-item command="color">
                  <el-icon><Brush /></el-icon>
                  更改颜色
                </el-dropdown-item>
                <el-dropdown-item command="delete" divided>
                  <el-icon><Delete /></el-icon>
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div v-if="speakers.length === 0" class="empty-state">
        <el-empty description="暂无发言者，点击右上角添加" :image-size="80" />
      </div>
    </div>

    <!-- 添加/编辑发言者对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'add' ? '添加发言者' : '编辑发言者'"
      width="400px"
      @close="handleDialogClose"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="80px"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="formData.name"
            placeholder="请输入发言者名称"
            maxlength="20"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="颜色" prop="color">
          <div class="color-picker-wrapper">
            <el-color-picker v-model="formData.color" show-alpha />
            <span class="color-value">{{ formData.color }}</span>
          </div>
        </el-form-item>

        <el-form-item label="头像" prop="avatarUrl">
          <el-input
            v-model="formData.avatarUrl"
            placeholder="请输入头像 URL（可选）"
            type="url"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 颜色选择对话框 -->
    <el-dialog
      v-model="colorDialogVisible"
      title="更改发言者颜色"
      width="350px"
    >
      <div class="color-presets">
        <div
          v-for="color in presetColors"
          :key="color"
          :class="['color-preset', { active: selectedColor === color }]"
          :style="{ backgroundColor: color }"
          @click="selectedColor = color"
        />
      </div>

      <template #footer>
        <el-button @click="colorDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleColorConfirm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Plus,
  MoreFilled,
  Edit,
  Delete,
  Brush,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import type { Speaker, Speech } from '@/services/api'

// Props
const props = withDefaults(
  defineProps<{
    speakers: Speaker[]
    speeches?: Speech[]
    sessionId?: string
  }>(),
  {
    speeches: () => [],
  },
)

// Emits
const emit = defineEmits<{
  (event: 'add', speaker: Omit<Speaker, 'id'>): void
  (event: 'update', speaker: Speaker): void
  (event: 'delete', speakerId: string): void
  (event: 'select', speakerId: string): void
}>()

// 状态
const selectedSpeakerId = ref<string>('')
const dialogVisible = ref(false)
const dialogMode = ref<'add' | 'edit'>('add')
const formRef = ref<FormInstance>()
const submitting = ref(false)
const currentEditSpeaker = ref<Speaker | null>(null)

const formData = ref({
  name: '',
  color: '#1890ff',
  avatarUrl: '',
})

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入发言者名称', trigger: 'blur' },
    { min: 1, max: 20, message: '长度在 1 到 20 个字符', trigger: 'blur' },
  ],
  color: [
    { required: true, message: '请选择发言者颜色', trigger: 'change' },
  ],
}

// 颜色选择
const colorDialogVisible = ref(false)
const selectedColor = ref('#1890ff')
const colorChangeTargetId = ref<string>('')

// 预设颜色
const presetColors = [
  '#1890ff', '#52c41a', '#faad14', '#f5222d',
  '#722ed1', '#eb2f96', '#13c2c2', '#2f54eb',
  '#fa8c16', '#a0d911', '#fa541c', '#9254de',
]

/**
 * 获取发言者的发言数量
 */
function getSpeakerSpeechCount(speakerId: string): number {
  return props.speeches.filter(s => s.speakerId === speakerId).length
}

/**
 * 处理选择发言者
 */
function handleSelectSpeaker(id: string) {
  selectedSpeakerId.value = id
  emit('select', id)
}

/**
 * 处理添加发言者
 */
function handleAddSpeaker() {
  dialogMode.value = 'add'
  formData.value = {
    name: '',
    color: presetColors[Math.floor(Math.random() * presetColors.length)],
    avatarUrl: '',
  }
  dialogVisible.value = true
}

/**
 * 处理命令
 */
function handleCommand(command: string, speaker: Speaker) {
  switch (command) {
    case 'edit':
      handleEdit(speaker)
      break
    case 'color':
      handleColorChange(speaker)
      break
    case 'delete':
      handleDelete(speaker)
      break
  }
}

/**
 * 处理编辑
 */
function handleEdit(speaker: Speaker) {
  dialogMode.value = 'edit'
  currentEditSpeaker.value = speaker
  formData.value = {
    name: speaker.name,
    color: speaker.color,
    avatarUrl: speaker.avatarUrl || '',
  }
  dialogVisible.value = true
}

/**
 * 处理颜色更改
 */
function handleColorChange(speaker: Speaker) {
  colorChangeTargetId.value = speaker.id
  selectedColor.value = speaker.color
  colorDialogVisible.value = true
}

/**
 * 处理删除
 */
function handleDelete(speaker: Speaker) {
  const speechCount = getSpeakerSpeechCount(speaker.id)
  const message = speechCount > 0
    ? `该发言者有 ${speechCount} 条发言记录，删除后这些记录将保留但发言者信息会丢失。确定删除吗？`
    : '确定删除该发言者吗？'

  ElMessageBox.confirm(message, '删除确认', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  }).then(() => {
    emit('delete', speaker.id)
    ElMessage.success('删除成功')
  }).catch(() => {
    // 用户取消
  })
}

/**
 * 处理对话框关闭
 */
function handleDialogClose() {
  formRef.value?.resetFields()
  currentEditSpeaker.value = null
}

/**
 * 处理提交
 */
async function handleSubmit() {
  if (!formRef.value) return

  await formRef.value.validate((valid) => {
    if (valid) {
      submitting.value = true

      setTimeout(() => {
        if (dialogMode.value === 'add') {
          emit('add', {
            sessionId: props.sessionId || '',
            name: formData.value.name,
            color: formData.value.color,
            avatarUrl: formData.value.avatarUrl || undefined,
          })
          ElMessage.success('添加成功')
        } else if (dialogMode.value === 'edit' && currentEditSpeaker.value) {
          emit('update', {
            ...currentEditSpeaker.value,
            name: formData.value.name,
            color: formData.value.color,
            avatarUrl: formData.value.avatarUrl || undefined,
          })
          ElMessage.success('更新成功')
        }

        submitting.value = false
        dialogVisible.value = false
        formRef.value?.resetFields()
        currentEditSpeaker.value = null
      }, 300)
    }
  })
}

/**
 * 处理颜色确认
 */
function handleColorConfirm() {
  const speaker = props.speakers.find(s => s.id === colorChangeTargetId.value)
  if (speaker) {
    emit('update', {
      ...speaker,
      color: selectedColor.value,
    })
    ElMessage.success('颜色更新成功')
  }
  colorDialogVisible.value = false
}

// 暴露方法
defineExpose({
  selectFirst: () => {
    if (props.speakers.length > 0) {
      handleSelectSpeaker(props.speakers[0].id)
    }
  },
})
</script>

<style scoped>
.speaker-manager {
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
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.speaker-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.speaker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.speaker-item:hover {
  background-color: var(--el-fill-color-light);
}

.speaker-item.selected {
  background-color: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
}

.speaker-avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.speaker-info {
  flex: 1;
  min-width: 0;
}

.speaker-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.speaker-stats {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.stat-item {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.speaker-actions {
  flex-shrink: 0;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
}

.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-value {
  font-size: 13px;
  color: var(--el-text-color-regular);
  font-family: monospace;
}

.color-presets {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  padding: 16px 0;
}

.color-preset {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.color-preset:hover {
  transform: scale(1.1);
}

.color-preset.active {
  border-color: var(--el-text-color-primary);
  transform: scale(1.15);
}

/* 滚动条样式 */
.speaker-list::-webkit-scrollbar {
  width: 6px;
}

.speaker-list::-webkit-scrollbar-track {
  background: transparent;
}

.speaker-list::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker);
  border-radius: 3px;
}

.speaker-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-border-color-dark);
}

/* 响应式 */
@media (max-width: 768px) {
  .panel-header {
    padding: 8px 12px;
  }

  .panel-title {
    font-size: 13px;
  }

  .speaker-item {
    padding: 8px 10px;
  }

  .speaker-avatar {
    width: 36px;
    height: 36px;
  }

  .avatar-placeholder {
    font-size: 14px;
  }

  .color-presets {
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .color-preset {
    width: 32px;
    height: 32px;
  }
}
</style>
