# 前端架构

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.5+ | 渐进式前端框架 |
| TypeScript | 5.4+ | 类型安全 |
| Vite | 5.1+ | 构建工具 |
| Pinia | 2.1+ | 状态管理 |
| Vue Router | 4.3+ | 路由管理 |
| Element Plus | 2.6+ | UI 组件库 |
| Vitest | 1.4+ | 单元测试 |
| Playwright | 1.57+ | E2E 测试 |

## 目录结构

```
frontend/src/
├── components/           # 可复用组件
│   ├── AIAnalysisPanel.vue       # AI 分析面板 (F1025-F1029)
│   ├── AppHeader.vue             # 应用头部导航 (F1032)
│   ├── MainLayout.vue            # 主布局容器 (F1031)
│   ├── MicPermission.vue         # 麦克风权限请求 (F1010)
│   ├── ModelSelector.vue         # AI 模型选择器 (F1028)
│   ├── RecordButton.vue          # 录音控制按钮 (F1033)
│   ├── SpeechList.vue            # 发言列表 (F1021)
│   └── TranscriptDisplay.vue     # 转写内容展示 (F1016-F1020)
│
├── views/               # 页面组件
│   ├── HomeView.vue     # 首页/会话列表 (F1006, F1009)
│   ├── MeetingView.vue  # 会议进行页面 (F1007, F1008)
│   └── SettingsView.vue # 设置页面
│
├── services/            # 业务服务层
│   ├── api.ts           # API 接口定义 (F1005)
│   ├── audioCapture.ts  # 音频捕获服务 (F1011, F1014, F1015)
│   ├── export.ts        # 导出功能服务 (F1029)
│   ├── http.ts          # HTTP 请求封装 (F1005)
│   ├── transcription.ts # 转写服务编排 (F1013)
│   └── websocket.ts     # WebSocket 连接服务 (F1012)
│
├── stores/              # Pinia 状态管理
│   └── meeting.ts       # 会议状态 (F1004)
│
├── router/              # 路由配置
│   └── index.ts         # 路由定义 (F1003)
│
├── utils/               # 工具函数
│   ├── uuid.ts          # UUID 生成 (F1037)
│   └── storage.ts       # 本地存储 (F1038)
│
├── types/               # TypeScript 类型定义
│   └── index.ts         # 通用类型
│
├── tests/               # 测试配置
│   ├── setup.ts         # 测试环境设置 (T1001)
│   └── example.spec.ts  # 示例测试
│
├── App.vue              # 根组件
├── main.ts              # 应用入口 (F1001)
└── env.d.ts             # 环境变量类型
```

## 核心设计模式

### 1. 服务层模式 (Service Layer)

服务层负责与后端 API 交互和业务逻辑编排：

```typescript
// services/transcription.ts
export class TranscriptionService {
  async start(config: TranscriptionConfig): Promise<void> {
    // 1. 连接 WebSocket
    // 2. 启动音频捕获
    // 3. 处理转写结果
  }
}
```

**优点**：
- 组件代码更简洁
- 业务逻辑可复用
- 便于单元测试

### 2. 单例模式 (Singleton)

全局服务使用单例模式：

```typescript
// services/transcription.ts
export const transcription = new TranscriptionService()

// services/audioCapture.ts
export const audioCapture = new AudioCaptureService()

// services/websocket.ts
export const websocket = new WebSocketService()
```

### 3. 组合式 API (Composition API)

使用 Vue 3 组合式 API 组织逻辑：

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'

// 响应式状态
const isRecording = ref(false)
const speeches = ref<Speech[]>([])

// 计算属性
const speechCount = computed(() => speeches.value.length)

// 监听器
watch(() => props.speeches, (newSpeeches) => {
  // 处理变化
})
</script>
```

### 4. 依赖注入风格

通过 props 和 emits 实现组件间通信：

```vue
<script setup lang="ts">
// Props 定义
const props = withDefaults(defineProps<{
  sessionId: string
  speeches: Speech[]
  disabled?: boolean
}>(), {
  disabled: false,
})

// Emits 定义
const emit = defineEmits<{
  (event: 'analyze', model: AIModel): void
  (event: 'generated', analysis: AIAnalysis): void
}>()
</script>
```

## 状态管理

使用 Pinia 进行全局状态管理：

```typescript
// stores/meeting.ts
export const useMeetingStore = defineStore('meeting', () => {
  // 状态
  const currentSession = ref<Session | null>(null)
  const speeches = ref<Speech[]>([])

  // 操作
  const startSession = async () => { /* ... */ }
  const addSpeech = (speech: Speech) => { /* ... */ }

  return {
    currentSession,
    speeches,
    startSession,
    addSpeech,
  }
})
```

## 路由设计

```
/                    → 首页（会话列表）
/meeting/:id         → 会议进行页面
/settings            → 设置页面
```

## 样式方案

- **CSS 方案**：原生 CSS（scoped）
- **设计系统**：Element Plus 主题定制
- **响应式**：移动端优先，媒体查询断点 768px

## 性能优化

1. **按需导入**：Element Plus 组件按需导入
2. **虚拟滚动**：转写列表使用虚拟滚动（大列表场景）
3. **防抖节流**：滚动事件使用防抖处理
4. **懒加载**：路由组件懒加载

## 近期重构方向：原文事件流 + 语句拆分

为解决流式 ASR 的纠错回写导致的“重复/插入”展示问题，转写链路以“原文事件流”为单一事实来源，
上层结构化能力由“语句拆分/纠错”异步产出并落库，前端按需订阅展示。

## 类型安全

```typescript
// types/index.ts
export type AIModel = 'glm'

export interface Speech {
  id: string
  sessionId: string
  content: string
  confidence: number
  // ...
}
```

## 错误处理

```typescript
// services/http.ts
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 统一错误处理
    ElMessage.error(error.message)
    return Promise.reject(error)
  }
)
```

---

**相关文档**：
- [组件文档](./components.md)
- [API 服务](./api-service.md)
- [状态管理](./state-management.md)
