# Vue 组件文档

## 组件列表

### 布局组件

#### MainLayout

主布局容器，包含顶部导航和内容区域。

**位置**: `src/components/MainLayout.vue` (F1031)

**Props**: 无

**Slots**:
- `default` - 内容区域

**示例**:
```vue
<MainLayout>
  <router-view />
</MainLayout>
```

---

#### AppHeader

应用顶部导航栏。

**位置**: `src/components/AppHeader.vue` (F1032)

**Props**: 无

**Emits**:
- `navigate` - 导航事件

**功能**:
- 显示应用标题
- 显示当前会话信息
- 提供设置入口

---

### 会议控制组件

#### MeetingActionBar

会议操作栏，提供录音、静音、结束会话与快捷键入口。

**位置**: `src/components/MeetingActionBar.vue`

**Props**:
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | `boolean` | - | 是否启用操作栏渲染 |
| `compact` | `boolean` | - | 是否使用紧凑布局 |
| `disabled` | `boolean` | - | 是否禁用按钮交互 |
| `ending` | `boolean` | - | 会话结束中状态 |
| `isSessionEnded` | `boolean` | - | 会话已结束标记 |
| `recordingStatus` | `'idle' \| 'connecting' \| 'recording' \| 'paused' \| 'error'` | - | 录音状态 |
| `isPaused` | `boolean` | - | 是否处于暂停状态 |

**Emits**:
| Event | Payload | 说明 |
|-------|---------|------|
| `toggle-recording` | - | 开始/停止录音 |
| `toggle-mute` | - | 暂停/继续 |
| `end-session` | - | 结束会话 |
| `toggle-realtime` | - | 切换实时面板 |

**暴露方法**:
| 方法 | 参数 | 说明 |
|------|------|------|
| `openHelp` | - | 打开快捷键弹窗 |

**使用场景**:
- 会议进行页的主操作栏（开始/停止录音、暂停/继续、结束会话）
- 窄屏模式下合并操作入口与快捷键提示

**相关文档**:
- [前端架构](./architecture.md)

---

#### MicPermission

麦克风权限请求组件。

**位置**: `src/components/MicPermission.vue` (F1010)

**Props**:
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `required` | `boolean` | `true` | 是否必须授权 |

**Emits**:
| Event | Payload | 说明 |
|-------|---------|------|
| `granted` | - | 授权成功 |
| `denied` | - | 授权失败 |

---

### 内容展示组件

#### TranscriptDisplay

实时转写内容展示面板。

**位置**: `src/components/TranscriptDisplay.vue` (F1016-F1020)

**Props**:
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `speeches` | `Speech[]` | `[]` | 发言记录列表 |
| `autoScroll` | `boolean` | `true` | 是否自动滚动 |

**Emits**:
| Event | Payload | 说明 |
|-------|---------|------|
| `refresh` | - | 刷新列表 |
| `clear` | - | 清空列表 |
| `select` | `id: string` | 选择发言 |
| `update:speech` | `speech: Speech` | 更新发言内容 |
| `toggle-mark` | `speech: Speech` | 切换标记状态 |

**暴露方法**:
| 方法 | 参数 | 说明 |
|------|------|------|
| `scrollToBottom` | - | 滚动到底部 |

**功能特性**:
- 实时显示转写内容
- 自动滚动控制
- 实时编辑功能
- 标记重要内容

---

#### SpeechList

发言列表组件。

**位置**: `src/components/SpeechList.vue` (F1021)

**Props**:
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `speeches` | `Speech[]` | `[]` | 发言记录 |
| `filter` | `string` | - | 搜索关键词 |

**Emits**:
| Event | Payload | 说明 |
|-------|---------|------|
| `select` | `speech: Speech` | 选择发言 |

**功能**:
- 列表展示
- 搜索过滤 (F1022 - 待实现)
- 标记管理 (F1023 - 待实现)

---

### AI 分析组件

#### AIAnalysisPanel

AI 分析面板组件。

**位置**: `src/components/AIAnalysisPanel.vue` (F1025-F1029)

**Props**:
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `sessionId` | `string` | - | 会话 ID |
| `speeches` | `Speech[]` | `[]` | 发言记录 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `autoGenerate` | `boolean` | `false` | 是否自动生成 |
| `defaultAnalysisType` | `string` | `'summary'` | 默认分析类型 |

**Emits**:
| Event | Payload | 说明 |
|-------|---------|------|
| `analyze` | `model, type` | 开始分析 |
| `generated` | `analysis: AIAnalysis` | 分析完成 |
| `error` | `error: Error` | 分析错误 |

**暴露方法**:
| 方法 | 参数 | 说明 |
|------|------|------|
| `setAnalysisResult` | `success, message` | 设置分析结果 |
| `reset` | - | 重置状态 |
| `generate` | - | 触发分析 |
| `clear` | - | 清空结果 |

**分析类型**:
- `summary` - 会议摘要
- `action-items` - 行动项
- `sentiment` - 情感分析
- `keywords` - 关键词
- `topics` - 议题分析
- `full-report` - 完整报告

**功能特性**:
- 多种分析类型切换
- 多 AI 模型选择
- 结果导出 (Markdown, TXT)
- 缓存机制
- 复制功能

---

#### ModelSelector

AI 模型选择器组件。

**位置**: `src/components/ModelSelector.vue` (F1028)

**Props**:
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `modelValue` | `AIModel` | - | 当前选中的模型 |
| `disabled` | `boolean` | `false` | 是否禁用 |

**Emits**:
| Event | Payload | 说明 |
|-------|---------|------|
| `update:modelValue` | `model: AIModel` | 模型变化 |

**可用模型**:
- `glm` - 智谱 GLM（模型版本由 `GLM_ANALYSIS_MODEL` 配置）
- `GLM_ANALYSIS_MODEL` 中配置的模型名 - 智谱 GLM（兼容别名）

---

## 组件使用示例

### 完整会议页面

```vue
<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>

    <div class="meeting-content">
      <div class="right-panel">
        <AIAnalysisPanel
          :session-id="sessionId"
          :speeches="speeches"
          @generated="handleAnalysisGenerated"
        />
      </div>
    </div>

    <MeetingActionBar
      :enabled="true"
      :compact="false"
      :disabled="!sessionId"
      :ending="endingSession"
      :isSessionEnded="isSessionEnded"
      :recordingStatus="recordingStatus"
      :isPaused="isPaused"
      @toggle-recording="toggleRecording"
      @toggle-mute="toggleMute"
      @end-session="endSession"
    />
  </MainLayout>
</template>
```

---

**相关文档**：
- [前端架构](./architecture.md)
- [状态管理](./state-management.md)
