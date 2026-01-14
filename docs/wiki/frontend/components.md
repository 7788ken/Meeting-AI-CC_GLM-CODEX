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

#### RecordButton

录音控制按钮。

**位置**: `src/components/RecordButton.vue` (F1033)

**Props**:
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `recording` | `boolean` | `false` | 是否正在录音 |
| `disabled` | `boolean` | `false` | 是否禁用 |

**Emits**:
| Event | Payload | 说明 |
|-------|---------|------|
| `start` | - | 开始录音 |
| `stop` | - | 停止录音 |
| `pause` | - | 暂停录音 |
| `resume` | - | 恢复录音 |

**状态**:
- `idle` - 空闲
- `recording` - 录音中
- `paused` - 已暂停

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
- 发言者颜色区分
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

#### SpeakerManager

发言者管理组件。

**位置**: `src/components/SpeakerManager.vue` (F1024)

**Props**:
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `speakers` | `Speaker[]` | `[]` | 发言者列表 |
| `sessionId` | `string` | - | 会话 ID |

**Emits**:
| Event | Payload | 说明 |
|-------|---------|------|
| `add` | `speaker: Speaker` | 添加发言者 |
| `update` | `speaker: Speaker` | 更新发言者 |
| `delete` | `id: string` | 删除发言者 |

**功能**:
- 发言者列表
- 添加/编辑发言者
- 颜色选择
- 头像上传

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
- `qianwen` - 千问
- `doubao` - 豆包
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
      <div class="left-panel">
        <RecordButton
          :recording="isRecording"
          @start="handleStart"
          @stop="handleStop"
        />
        <TranscriptDisplay
          :speeches="speeches"
          :auto-scroll="autoScroll"
          @update:speech="handleUpdateSpeech"
        />
      </div>

      <div class="right-panel">
        <SpeakerManager
          :speakers="speakers"
          :session-id="sessionId"
        />
        <AIAnalysisPanel
          :session-id="sessionId"
          :speeches="speeches"
          @generated="handleAnalysisGenerated"
        />
      </div>
    </div>
  </MainLayout>
</template>
```

---

**相关文档**：
- [前端架构](./architecture.md)
- [状态管理](./state-management.md)
