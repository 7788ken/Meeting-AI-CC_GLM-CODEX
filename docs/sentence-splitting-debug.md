# 语句拆分模块 Debug 分析文档

> 文档创建时间: 2026-01-12
> 分析范围: TranscriptAnalysisService (语句拆分/转写语句拆分分析模块)

---

## 一、问题陈述

### 用户期望
```
输入：原文转写数据（例如：2个人5句对话）
期望输出：将对话进行分离，生成5个独立的对话记录并落库
附加功能期望：翻译功能
```

### 实际行为
当前模块**仅按说话人分段**，不会：
1. 执行翻译操作
2. 按语义边界分段（仅按speakerId边界）
3. 将单条说话人的多句内容拆分为多个记录

---

## 二、架构分析

### 2.1 数据流图

```
┌─────────────────┐
│  豆包 ASR       │
│  (语音识别)     │
└────────┬────────┘
         │ transcript:result
         ▼
┌─────────────────────────────────┐
│  TranscriptStreamService        │
│  - upsertEvent()                │  → transcript_events collection
│  - 维护 eventIndex (单调递增)    │
└────────┬────────────────────────┘
         │
         │ schedule(sessionId)  ────────┐
         │                                │
         ▼                                │
┌─────────────────────────────────┐       │
│  TranscriptAnalysisService      │       │
│  - processSession()             │       │
│  - analyzeEvents()              │       │
│  - 按 CHUNK_SIZE=5 分块处理     │       │
└────────┬────────────────────────┘       │
         │ GLM API Call                   │
         ▼                                │
┌─────────────────────────────────┐       │
│  GLM-4.6v-flash                 │       │
│  - 接收结构化 JSON 输出          │       │
└────────┬────────────────────────┘       │
         │                                │
         ▼                                │
┌─────────────────────────────────┐       │
│  transcript_analysis_chunks     │       │
│  - dialogues[]                  │       │
│  - startEventIndex/endEventIndex│       │
└─────────────────────────────────┘       │
                                          │
                                    每个事件触发
                                    schedule(sessionId)
```

### 2.2 核心文件清单

| 文件路径 | 职责 |
|---------|------|
| `backend/src/modules/transcript-analysis/transcript-analysis.service.ts` | 核心服务：调度、处理、落库 |
| `backend/src/modules/transcript-analysis/transcript-analysis.prompt.ts` | LLM Prompt 构建 |
| `backend/src/modules/transcript-analysis/transcript-analysis.validation.ts` | 结果校验 + 启发式fallback |
| `backend/src/modules/transcript-analysis/transcript-analysis.glm-client.ts` | GLM API 客户端 |
| `backend/src/modules/transcript-analysis/schemas/transcript-analysis-chunk.schema.ts` | MongoDB Schema |
| `backend/src/modules/transcript-stream/transcript-stream.service.ts` | 原文事件流存储 |

### 2.3 环境配置项

```bash
# .env 配置
TRANSCRIPT_ANALYSIS_CHUNK_SIZE=5              # 每次处理事件数
TRANSCRIPT_ANALYSIS_CONCURRENCY=3             # 最大并发会话数
TRANSCRIPT_ANALYSIS_REQUIRE_FINAL=0           # 是否只处理 isFinal=true 事件

GLM_API_KEY=...                               # GLM API Key
GLM_TRANSCRIPT_ANALYSIS_MODEL=glm-4.6v-flash  # 模型名称
GLM_TRANSCRIPT_ANALYSIS_MAX_TOKENS=2000       # 输出 token 上限
GLM_TRANSCRIPT_ANALYSIS_JSON_MODE=1           # JSON 模式
```

---

## 三、Prompt 深度分析

### 3.1 当前 Prompt 内容

文件: `backend/src/modules/transcript-analysis/transcript-analysis.prompt.ts`

```typescript
const system = [
  '你是"会议语句拆分器"。你的任务是：仅基于输入的转写事件，输出结构化对话分段。',
  '',
  '强约束：',
  '- 只允许输出 JSON，禁止输出任何 Markdown、解释或多余文本。',
  '- 严禁改写、润色、补写原文内容。',
  '',
  '输出 JSON 格式（必须严格匹配）：',
  '{ "dialogues": [ { "speakerId": "...", "speakerName": "...", "startEventIndex": 0, "endEventIndex": 0, "content": "..." } ] }',
  '',
  '分段规则：',
  '- dialogues 必须覆盖输入范围：startEventIndex..endEventIndex（无缺口、无重叠，按时间顺序）。',
  '- 相邻对话必须连续：后一段 startEventIndex = 前一段 endEventIndex + 1。',
  '- **每个对话内必须保持同一 speakerId**（同一 speaker 连续发言）。',  // ← 关键约束
  '- speakerId / speakerName 必须来自输入事件（不可编造）。',
  '- content 必须为该段内所有事件 content 的按序拼接（不新增、不删减、不改写）。',
  '- 若无法保证以上规则，请输出 1 个对话覆盖整个范围，speakerId/speakerName 取输入事件列表的第一条。',
].join('\n')
```

### 3.2 Prompt 限制分析

| 约束项 | 说明 | 影响 |
|-------|------|------|
| `每个对话内必须保持同一 speakerId` | **这是核心限制** | 同一说话人的多句内容会被合并为一个 dialogue |
| `content 必须为该段内所有事件 content 的按序拼接` | 禁止改写 | 无法实现翻译功能 |
| `严禁改写、润色、补写原文内容` | 只做结构化 | 无法实现任何文本变换 |
| `dialogues 必须覆盖输入范围` | 无缺口、无重叠 | LLM 无法跳过某些事件 |

### 3.3 实际行为示例

**输入 (5条事件，2个人)**:
```json
{
  "events": [
    { "eventIndex": 0, "speakerId": "A", "speakerName": "张三", "content": "大家好" },
    { "eventIndex": 1, "speakerId": "A", "speakerName": "张三", "content": "今天讨论" },
    { "eventIndex": 2, "speakerId": "B", "speakerName": "李四", "content": "好的" },
    { "eventIndex": 3, "speakerId": "B", "speakerName": "李四", "content": "我先说" },
    { "eventIndex": 4, "speakerId": "A", "speakerName": "张三", "content": "请开始" }
  ]
}
```

**当前 Prompt 输出**:
```json
{
  "dialogues": [
    { "speakerId": "A", "speakerName": "张三", "startEventIndex": 0, "endEventIndex": 1, "content": "大家好今天讨论" },
    { "speakerId": "B", "speakerName": "李四", "startEventIndex": 2, "endEventIndex": 3, "content": "好的我先说" },
    { "speakerId": "A", "speakerName": "张三", "startEventIndex": 4, "endEventIndex": 4, "content": "请开始" }
  ]
}
```

**用户期望输出** (5个独立记录):
```json
{
  "dialogues": [
    { "speakerId": "A", "speakerName": "张三", "startEventIndex": 0, "endEventIndex": 0, "content": "大家好" },
    { "speakerId": "A", "speakerName": "张三", "startEventIndex": 1, "endEventIndex": 1, "content": "今天讨论" },
    { "speakerId": "B", "speakerName": "李四", "startEventIndex": 2, "endEventIndex": 2, "content": "好的" },
    { "speakerId": "B", "speakerName": "李四", "startEventIndex": 3, "endEventIndex": 3, "content": "我先说" },
    { "speakerId": "A", "speakerName": "张三", "startEventIndex": 4, "endEventIndex": 4, "content": "请开始" }
  ]
}
```

---

## 四、问题根因

### 4.1 设计理念偏差

| 方面 | 当前设计 | 用户期望 |
|-----|---------|---------|
| 分段粒度 | 按 speaker turn (同一说话人连续发言合并) | 按单条事件 (每句独立) |
| 处理范围 | 结构化分段 (不改写) | 翻译 + 语句分离 |
| 输出内容 | 原文拼接 | 翻译后内容 |

### 4.2 术语混乱

代码中存在两个相似但不同的模块：

| 模块 | 文件路径 | 功能 |
|-----|---------|------|
| **TurnSegmentationService** | `turn-segmentation/` | 按 speaker turn 分段 |
| **TranscriptAnalysisService** | `transcript-analysis/` | 也叫"语句拆分"（旧称"语义分段"），实际也是按 speaker 分段 |

这两个模块功能高度重复，都只是按说话人合并，真正的"语义分析"缺失。

### 4.3 缺失功能

1. **翻译功能**: 完全未实现
2. **按语义边界分段**: Prompt 未包含语义分析指令
3. **单句独立**: 约束强制合并同说话人的连续内容

---

## 五、数据模型分析

### 5.1 transcript_analysis_chunks 结构

```typescript
{
  _id: ObjectId,
  sessionId: string,           // 会话ID
  startEventIndex: number,     // 起始事件索引
  endEventIndex: number,       // 结束事件索引
  status: 'processing' | 'completed' | 'failed',
  dialogues: [
    {
      speakerId: string,
      speakerName: string,
      startEventIndex: number,
      endEventIndex: number,
      content: string          // 原文拼接，无翻译
    }
  ],
  error?: string,
  model?: string,              // 'glm' | 'heuristic'
  generatedAt?: Date,
  createdAt: Date,
  updatedAt: Date
}

// 索引
{ sessionId: 1, startEventIndex: 1, endEventIndex: 1 } // unique
```

### 5.2 问题

1. `content` 字段存储原文，没有 `translatedContent` 字段
2. 一个 chunk 可能包含多个 dialogue (按 speaker 合并)
3. 没有与前端 API 对接的 controller (缺失 REST 接口)

---

## 六、触发机制分析 (用户补充问题)

### 6.1 当前触发时机

代码中**已有三个触发点**：

| 触发点 | 位置 | 说明 |
|-------|------|------|
| 实时触发 | [main.ts:934](backend/src/main.ts#L934) | 每次原文事件落库后 `schedule(sessionId)` |
| stop_transcribe | [main.ts:301](backend/src/main.ts#L301) | 停止录音时 `triggerTranscriptAnalysisNow(sessionId)` |
| end_turn | [main.ts:362](backend/src/main.ts#L362) | VAD 检测到停顿时 `triggerTranscriptAnalysisNow(sessionId)` |

**结论**: 实时触发**已实现**，但存在延迟机制导致感知不实时。

### 6.2 延迟原因分析

虽然每次事件落库都调用了 `schedule()`，但存在以下延迟机制：

```typescript
// transcript-analysis.service.ts:43-62
schedule(sessionId: string, options?: { force?: boolean }): void {
  // 1. 去抖：已在队列中则跳过
  if (this.queuedSessions.has(sessionId)) {
    return  // ← 如果已在队列，直接返回，不重复调度
  }

  // 2. 队列排队：正在处理则加入 pending
  if (this.inFlightSessions.has(sessionId)) {
    this.pendingSessions.add(sessionId)  // ← 等待当前处理完成
    return
  }

  // 3. 并发限制：最多同时处理 CONCURRENCY=3 个会话
  const limit = this.readConcurrencyLimit()  // 默认 3
  if (this.inFlightCount >= limit) {
    return  // ← 达到并发上限，排队等待
  }
}
```

**延迟根因**：

| 配置项 | 默认值 | 影响 |
|-------|-------|------|
| `TRANSCRIPT_ANALYSIS_CONCURRENCY=3` | 3 | 同时最多处理3个会话 |
| `TRANSCRIPT_ANALYSIS_CHUNK_SIZE=5` | 5 | 积累5条事件才处理一次 |
| `TRANSCRIPT_ANALYSIS_REQUIRE_FINAL=0` | 0 | 可以处理未最终确认的事件 |

### 6.3 实际行为示例

```
时间轴（当前行为）：
t0: 事件0落库 → schedule() → 加入队列，等待 chunkSize=5
t1: 事件1落库 → schedule() → 已在队列，跳过
t2: 事件2落库 → schedule() → 已在队列，跳过
t3: 事件3落库 → schedule() → 已在队列，跳过
t4: 事件4落库 → schedule() → 触发处理 (GLM API 调用，耗时约 1-3s)
t5: 事件5落库 → schedule() → 加入队列，等待下一批
...
```

**用户期望行为**：
```
t0: 事件0落库 → 立即处理 → 立即落库
t1: 事件1落库 → 立即处理 → 立即落库
...
```

### 6.4 解决方案建议

**方案 1**: 降低 CHUNK_SIZE
```bash
# 修改 .env
TRANSCRIPT_ANALYSIS_CHUNK_SIZE=1  # 每条事件立即处理
```

**方案 2**: 增加并发限制
```bash
TRANSCRIPT_ANALYSIS_CONCURRENCY=10  # 允许更多并发
```

**方案 3**: 移除队列去抖，修改调度逻辑
```typescript
// 当前：已在队列则跳过
if (this.queuedSessions.has(sessionId)) {
  return
}

// 建议改为：更新队列中的优先级
if (this.queuedSessions.has(sessionId)) {
  // 移到队头，提升优先级
  this.queue = this.queue.filter(id => id !== sessionId)
  this.queue.unshift(sessionId)
  return
}
```

### 6.5 前端缺失

**没有对应的 API 端点**:
- `GET /api/transcript-analysis/session/:sessionId` → 不存在
- 前端无法查询分析结果
- `TurnSegmentsPanel.vue` 显示的是 `TurnSegmentationService` 的结果，不是 `TranscriptAnalysisService`

### 6.6 WebSocket 消息

后端**不推送**语义分析结果，只推送:
- `transcript_event_upsert` (原文事件)
- `turn_segments_upsert` (轮次分段)

**建议新增**: `transcript_analysis_upsert` 消息类型，实时推送分析结果。

---

## 七、解决方案建议

### 方案 A: 修改 Prompt 实现单句分离

**适用场景**: 保持现有架构，只修改分段规则

修改 `transcript-analysis.prompt.ts`:

```typescript
const system = [
  '你是"会议语句拆分器"。你的任务是：将每条转写事件分离为独立对话。',
  '',
  '分段规则：',
  '- **每条事件必须成为一个独立的 dialogue**（不再合并同说话人的连续事件）。',
  '- dialogue 的 startEventIndex 必须等于 endEventIndex。',
  '- speakerId / speakerName 来自输入事件。',
  '- content 直接使用事件的 content。',
  // ... 其他规则
].join('\n')
```

**优点**: 简单，符合用户期望的"5句=5条记录"
**缺点**: 仍无法实现翻译

### 方案 B: 新增翻译功能

**修改数据模型**:

```typescript
export class TranscriptDialogue {
  @Prop({ required: true })
  speakerId: string

  @Prop({ required: true })
  speakerName: string

  @Prop({ required: true })
  startEventIndex: number

  @Prop({ required: true })
  endEventIndex: number

  @Prop({ required: true })
  content: string           // 原文

  @Prop()                   // 新增
  translatedContent?: string // 翻译内容

  @Prop()                   // 新增
  targetLanguage?: string   // 目标语言，如 'en'
}
```

**修改 Prompt**:

```typescript
const system = [
  '你是"会议语句拆分与翻译器"。',
  '',
  '任务：',
  '1. 将每条转写事件分离为独立对话。',
  '2. 将 content 翻译成英文。',
  '',
  '输出格式：',
  '{ "dialogues": [ { "speakerId": "...", "speakerName": "...", "startEventIndex": 0, "endEventIndex": 0, "content": "...", "translatedContent": "..." } ] }',
].join('\n')
```

### 方案 C: 完全重构语义分析

将 `TranscriptAnalysisService` 改造为真正的语义分析模块:

1. **调用链解耦**: 与 TurnSegmentationService 分离职责
2. **新增 Controller**: `TranscriptAnalysisController`
3. **前端集成**: 新增组件展示翻译结果

---

## 八、调试检查清单

### 8.1 环境检查

```bash
# 检查配置
grep TRANSCRIPT_ANALYSIS .env

# 预期输出
TRANSCRIPT_ANALYSIS_CHUNK_SIZE=5        # 每次处理5条事件
TRANSCRIPT_ANALYSIS_CONCURRENCY=3       # 最大3个并发会话
TRANSCRIPT_ANALYSIS_REQUIRE_FINAL=0     # 处理所有事件
```

### 8.2 MongoDB 检查

```javascript
// 查询语句拆分结果
db.transcript_analysis_chunks.find({ sessionId: "your-session-id" }).sort({ startEventIndex: 1 })

// 检查状态分布
db.transcript_analysis_chunks.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])

// 检查 dialogues 结构
db.transcript_analysis_chunks.findOne(
  { sessionId: "your-session-id" },
  { dialogues: 1, _id: 0 }
)
```

### 8.3 日志检查

后端日志关键词:
- `Transcript analysis failed`
- `GLM analysis fallback to heuristic`
- `schedule(sessionId)`

---

## 九、总结

### 问题核心

| 问题 | 说明 |
|-----|------|
| **命名误导** | "语句拆分"（旧称"语义分段"）实际只是"说话人分段" |
| **功能缺失** | 无翻译、无真正语义分析 |
| **前端断联** | 无API、无组件展示分析结果 |
| **Prompt约束** | 强制合并同说话人内容 |
| **实时性不足** | CHUNK_SIZE=5 + 队列去抖导致延迟 |

### 建议优先级

1. **紧急**: 修改 `.env` 降低延迟
   ```bash
   TRANSCRIPT_ANALYSIS_CHUNK_SIZE=1
   TRANSCRIPT_ANALYSIS_CONCURRENCY=10
   ```

2. **短期**: 修改 Prompt 实现单句分离 (方案A)

3. **中期**: 新增翻译功能 (方案B)

4. **长期**: 重构为真正的语义分析模块 (方案C)

---

## 十、优化方案（架构重组 v1.0）

> 设计时间: 2026-01-13
> 设计原则: KISS + DRY + YAGNI + SOLID

### 10.1 对原方案 A/B/C 的批判性评估

| 方案 | 核心问题 | 风险评级 |
|-----|---------|---------|
| **A: 修改Prompt实现单句分离** | 用LLM做规则可完成的事，浪费成本和延迟 | 🔴 高 |
| **B: 新增翻译功能** | 缺少成本控制、失败fallback、语言策略 | 🟡 中 |
| **C: 完全重构** | 空话，缺少具体实施步骤 | 🔴 高 |

### 10.2 核心洞察

**单句分离不需要 LLM** — 用户想要的"5句=5条记录"可以用简单规则实现，零成本、零延迟。

**翻译应该独立** — 翻译与分段是两个职责，应该解耦为独立模块。

**代码重复严重** — `TranscriptAnalysisService` 与 `TurnSegmentationService` 重复度 85%-95%。

### 10.3 新架构设计

```
backend/src/
├── common/sentence-splitting/              # 新建公共层
│   ├── core/
│   │   ├── segment.types.ts                # 统一类型定义
│   │   ├── glm-client.ts                   # 统一GLM客户端
│   │   ├── prompt-builder.ts               # 统一Prompt构建
│   │   └── validation.ts                   # 统一验证逻辑
│   └── strategies/
│       ├── rule-based-segmenter.ts         # 规则分段器（单句分离）
│       └── heuristic-segmenter.ts          # 启发式分段器（speaker合并）
│
├── modules/transcript-analysis/            # 改造：专注语句拆分
│   └── transcript-analysis.service.ts      # 使用公共层 + 规则分段
│
└── modules/translation/                    # 新建：独立的翻译模块
    ├── translation.service.ts              # 翻译服务
    ├── translation.prompt.ts               # 翻译Prompt
    └── schemas/
        └── translation.schema.ts           # 翻译结果存储
```

### 10.4 数据模型设计

```typescript
// ========== 统一分段类型 ==========
export interface SemanticSegment {
  speakerId: string
  speakerName: string
  startEventIndex: number
  endEventIndex: number
  content: string                      // 原文（事件拼接）
  translatedContent?: string           // 可选翻译
  translationLanguage?: string         // 翻译目标语言
}

// ========== 分块结果 ==========
export interface SemanticChunk {
  sessionId: string
  startEventIndex: number
  endEventIndex: number
  status: 'processing' | 'completed' | 'failed'
  segments: SemanticSegment[]
  model: 'rule-based' | 'llm' | 'heuristic'
  generatedAt: Date
  createdAt: Date
  updatedAt: Date
}

// ========== 翻译任务（独立存储）==========
export interface TranslationTask {
  _id: ObjectId
  sessionId: string
  segmentRange: { start: number; end: number }
  targetLanguage: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  results: Array<{
    eventIndex: number
    originalContent: string
    translatedContent: string
  }>
  error?: string
  createdAt: Date
  updatedAt: Date
}
```

### 10.5 规则分段器实现（零成本单句分离）

```typescript
// common/sentence-splitting/strategies/rule-based-segmenter.ts
export function segmentByEvent(input: {
  events: TranscriptEventDTO[]
}): SemanticSegment[] {
  // 每条事件成为一个独立的segment
  return input.events.map(event => ({
    speakerId: event.speakerId,
    speakerName: event.speakerName,
    startEventIndex: event.eventIndex,
    endEventIndex: event.eventIndex,
    content: event.content
  }))
}
```

**成本**: 0 API调用，0ms延迟
**对比原方案A**: 节省 100% LLM成本

### 10.6 翻译模块架构

翻译作为**独立可选模块**，与分段解耦：

```typescript
// modules/translation/translation.service.ts
export class TranslationService {
  /**
   * 批量翻译segments
   * @param batchSize 每批翻译数量（控制成本）
   */
  async translateSegments(input: {
    sessionId: string
    segments: SemanticSegment[]
    targetLanguage: string
    batchSize?: number
  }): Promise<SemanticSegment[]> {
    // 1. 检查哪些segment已翻译（去重）
    // 2. 批量调用LLM翻译
    // 3. 存储翻译结果
    // 4. 返回更新后的segments
  }
}
```

**成本控制策略**:
- 批量翻译，减少API调用次数
- 翻译结果缓存，避免重复翻译
- 按需翻译，不自动开启

### 10.7 环境配置优化

```bash
# ========== 分段配置 ==========
TRANSCRIPT_ANALYSIS_CHUNK_SIZE=1         # 单句立即处理
TRANSCRIPT_ANALYSIS_CONCURRENCY=10       # 提高并发
TRANSCRIPT_ANALYSIS_MODE=rule-based      # 规则模式（默认）
TRANSCRIPT_ANALYSIS_ENABLE_LLM=false     # LLM模式（可选）

# ========== 翻译配置 ==========
TRANSLATION_ENABLED=false                # 翻译开关（默认关闭）
TRANSLATION_TARGET_LANGUAGE=en           # 翻译目标语言
TRANSLATION_BATCH_SIZE=10                # 翻译批次大小
TRANSLATION_ON_DEMAND=true               # 按需翻译
```

### 10.8 处理流程

```
事件到达 → 规则分段（立即） → 落库（实时）
                                    ↓
                             [可选] 翻译任务（异步）
```

**时间对比**:
- 原方案: 事件0-4到达 → 等待 → LLM调用(1-3s) → 落库
- 新方案: 事件到达 → 规则分段(<1ms) → 落库

### 10.9 实施步骤

**Phase 1: 公共层提取** (1-2天)
```
1. 创建 common/sentence-splitting/ 目录
2. 提取 GLM Client → glm-client.ts
3. 提取 Prompt Builder → prompt-builder.ts
4. 提取 Validation → validation.ts
5. 提取 Heuristic → heuristic-segmenter.ts
6. 添加 Rule-based Segreter → rule-based-segmenter.ts
```

**Phase 2: 改造 TranscriptAnalysisService** (1天)
```
1. 移除内部重复代码
2. 使用公共层
3. 添加分段模式配置（rule-based/llm）
4. 添加 REST API
```

**Phase 3: 新增翻译模块** (2-3天)
```
1. 创建 modules/translation/
2. 实现 TranslationService
3. 实现翻译 Prompt
4. 创建 Translation Schema
5. 添加 Translation Controller
6. WebSocket 推送翻译结果
```

**Phase 4: 前端集成** (1-2天)
```
1. 新增翻译结果展示组件
2. 添加翻译开关控制
3. 调用新API
```

**Phase 5: 清理** (1天)
```
1. 评估 TurnSegmentationService 是否保留
2. 如果废弃，迁移历史数据
3. 删除重复代码
```

### 10.10 方案对比

| 维度 | 原方案A/B/C | 新方案 |
|-----|------------|-------|
| 单句分离成本 | LLM调用（高） | 规则处理（零） |
| 单句分离延迟 | 1-3秒 | <1ms（实时） |
| 代码重复 | 85%-95% | 消除 |
| 翻译功能 | 耦合在分段中 | 独立可选模块 |
| 实施难度 | 模糊 | 5个阶段，共6-9天 |
| 风险控制 | 未评估 | 分阶段可回滚 |

### 10.11 待确认问题

| 问题 | 选项 | 影响 |
|-----|------|------|
| TurnSegmentationService 是否保留？ | A: 废弃迁移 / B: 保留 | 前端兼容性 |
| 翻译是否必需？ | A: 默认开启 / B: 按需开启 | 成本和复杂度 |
| 是否需要引入真正的语义分段（按话题分段）？ | 按话题分段（需LLM） | 未来需求 |

---

## 十一、最终方案：混合分段策略 v2.0

> 设计时间: 2026-01-13
> 设计原则: KISS + DRY + YAGNI + SOLID
> 方案来源: Claude Code + Codex CLI 协作设计

### 11.1 需求澄清

**真实需求**：按"说话人轮次"智能分段，而非简单的事件级别分离。

### 输入示例
```json
{
  "events": [
    { "eventIndex": 0, "speakerId": "A", "timestamp": 1000, "content": "大家好" },
    { "eventIndex": 1, "speakerId": "A", "timestamp": 2000, "content": "今天我们讨论项目进展" },
    { "eventIndex": 2, "speakerId": "B", "timestamp": 5000, "content": "好的" },
    { "eventIndex": 3, "speakerId": "A", "timestamp": 8000, "content": "请开始吧" }
  ]
}
```

### 期望输出（3个segment）
```json
{
  "segments": [
    { "speakerId": "A", "startEventIndex": 0, "endEventIndex": 1, "content": "大家好，今天我们讨论项目进展" },
    { "speakerId": "B", "startEventIndex": 2, "endEventIndex": 2, "content": "好的" },
    { "speakerId": "A", "startEventIndex": 3, "endEventIndex": 3, "content": "请开始吧" }
  ]
}
```

### 11.2 核心挑战

1. **ASR特性**：原文有误差、方言、标点不规范
2. **轮次判断**：同一说话人的连续发言何时应该合并？何时应该拆分？
3. **时间间隔**：需要基于时间戳判断轮次边界
4. **语义完整性**：判断一段话是否完整表达了一个意思

### 11.3 混合分段策略：两层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        输入：ASR 事件流                          │
│  (eventIndex, speakerId, timestamp, content, confidence)       │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     第一层：规则预分段                           │
│  - R1: 说话人边界判断                                            │
│  - R2: 连续句合并（时间间隔 + 语义衔接）                         │
│  - R3: 异常检测与标记                                            │
│  - R4: 标点补齐                                                  │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
                      ┌───────────────┐
                      │   有异常标记？  │
                      └───────┬───────┘
                              │
                 ┌────────────┴────────────┐
                 │ 是                       │ 否
                 ▼                          ▼
┌───────────────────────────┐    ┌─────────────────────────────────┐
│   第二层：LLM 校正规整      │    │   直接输出规则分段结果            │
│   - 处理标记的异常          │    │   - 零延迟                        │
│   - 语义完整性判断          │    │   - 零成本                        │
│   - 边界微调               │    │                                  │
└───────────────────────────┘    └─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        输出：分段结果                            │
│  (segments[], model: "rule" | "rule+llm")                       │
└─────────────────────────────────────────────────────────────────┘
```

### 11.4 规则分段层（第一层）

#### R1: 说话人边界判断
```typescript
function detectSpeakerBoundary(prev: Event, curr: Event): boolean {
  // 说话人切换 → 必定断开
  if (prev.speakerId !== curr.speakerId) return true

  // 同一说话人，时间间隔 > 阈值 → 可能断开
  const gap = curr.timestamp - prev.timestamp
  if (gap > SPEAKER_TURN_THRESHOLD_MS) return true

  return false
}
```

#### R2: 连续句合并策略
```typescript
function shouldMergeSameSpeaker(events: Event[]): boolean {
  if (events.length < 2) return false

  // 条件1: 时间间隔短（默认 < 1.2秒）
  const maxGap = Math.max(...events.slice(1).map((e, i) =>
    e.timestamp - events[i].timestamp
  ))
  if (maxGap > MERGE_GAP_THRESHOLD_MS) return false

  // 条件2: 语义衔接（无转折词、无问号）
  const content = events.map(e => e.content).join("")
  if (TRANSITION_WORDS.some(w => content.includes(w))) return false
  if (content.includes("？") || content.includes("?")) return false

  // 条件3: 长度不超过阈值（避免过长段落）
  if (content.length > MAX_SEGMENT_LENGTH) return false

  return true
}
```

#### R3: 异常检测与标记
```typescript
interface SegmentFlag {
  type: 'low_conf' | 'speaker_uncertain' | 'conflict' | 'long_segment'
  reason: string
}

function detectAnomalies(segment: Segment): SegmentFlag[] {
  const flags: SegmentFlag[] = []

  // 低置信度标记
  if (segment.minConfidence < CONFIDENCE_THRESHOLD) {
    flags.push({ type: 'low_conf', reason: 'ASR confidence low' })
  }

  // 说话人不确定
  if (segment.speakerConfidence < SPEAKER_CONFIDENCE_THRESHOLD) {
    flags.push({ type: 'speaker_uncertain', reason: 'Speaker diarization uncertain' })
  }

  // 潜在冲突（如包含"你说"、"对"等可能误识别的词）
  if (hasConflictMarkers(segment.content)) {
    flags.push({ type: 'conflict', reason: 'Possible speaker misidentification' })
  }

  return flags
}
```

#### R4: 标点补齐
```typescript
function normalizePunctuation(content: string): string {
  // 基于停顿时间补标点（在规则层已合并，这里只是语义上的补齐）
  // 实际标点由 ASR 提供，这里只处理明显缺失的情况

  return content
    .replace(/\s+/g, '')  // 移除多余空格
    .replace(/([^.!?。！？])$/, '$1。')  // 句末补句号
}
```

### 11.5 LLM 校正层（第二层，可选）

#### 触发条件
- 规则阶段输出的 segments 中存在 `low_conf` 或 `conflict` 标记
- 连续段长度差异 > 2倍
- 目标轮次数与说话人人次统计不匹配

#### Prompt 设计
```typescript
const SYSTEM_PROMPT = `
你是"会议转写轮次分段校正器"。你的任务是基于规则预分段结果，进行边界微调。

输入包含：
- events: 原始ASR事件（含timestamp、speakerId、content、confidence）
- ruleSegments: 规则分段结果（含flags标记）

约束：
1. 优先保持规则分段的边界（基于时间间隔和说话人切换）
2. 仅处理有flags标记的异常segment
3. 不跨越说话人合并
4. 输出JSON格式

输出格式：
{
  "segments": [
    {
      "speakerId": "A",
      "startEventIndex": 0,
      "endEventIndex": 1,
      "content": "合并后的内容",
      "adjustmentReason": "规则分段正确" | "调整原因..."
    }
  ]
}
`
```

### 11.6 环境配置

```bash
# ========== 分段配置 ==========
SEGMENTATION_MODE=hybrid                    # 模式: rule | hybrid | llm
SEGMENTATION_SPEAKER_TURN_THRESHOLD_MS=3500 # 说话人轮次时间阈值
SEGMENTATION_MERGE_GAP_THRESHOLD_MS=1200    # 合并同一说话人的时间阈值
SEGMENTATION_MAX_SEGMENT_LENGTH=200         # 单段最大字符数

# ========== LLM 配置 ==========
SEGMENTATION_LLM_ENABLED=true               # 是否启用LLM校正
SEGMENTATION_LLM_MODEL=glm-4.6v-flash       # LLM模型
SEGMENTATION_LLM_FLAGS_REQUIRED=low_conf,conflict  # 触发LLM的标记类型
```

### 11.7 数据流

```typescript
interface SegmentResult {
  sessionId: string
  startEventIndex: number
  endEventIndex: number
  segments: SemanticSegment[]
  model: 'rule' | 'rule+llm'
  processingTimeMs: number
  llmCallCount: number
  createdAt: Date
}

interface SemanticSegment {
  speakerId: string
  speakerName: string
  startEventIndex: number
  endEventIndex: number
  content: string
  flags: SegmentFlag[]  // 规则层标记的异常
  adjustmentReason?: string  // LLM调整原因（如有）
}
```

### 11.8 实施步骤

**Phase 1: 规则分段器实现** (1-2天)
```typescript
// common/sentence-splitting/strategies/hybrid-segmenter.ts
export class HybridSegmenter {
  segment(input: Event[]): SegmentResult {
    // 1. 规则预分段
    const ruleResult = this.ruleBasedSegment(input)

    // 2. 检查是否需要LLM校正
    if (this.needsLLMCorrection(ruleResult)) {
      return this.llmCorrect(input, ruleResult)
    }

    return ruleResult
  }
}
```

**Phase 2: LLM 校正服务** (1-2天)
```typescript
// modules/transcript-analysis/llm-corrector.service.ts
export class LLMCorrectorService {
  async correct(input: {
    events: Event[]
    ruleSegments: SemanticSegment[]
  }): Promise<SemanticSegment[]> {
    // 调用 GLM API 进行校正
  }
}
```

**Phase 3: 集成到 TranscriptAnalysisService** (1天)
- 替换现有 Prompt 为混合分段策略
- 添加配置项支持
- 添加指标统计（处理时间、LLM调用次数）

**Phase 4: 测试验证** (1天)
- 单元测试：规则分段器
- 集成测试：完整流程
- 回归测试：前端兼容性

### 11.9 方案对比

| 维度 | 纯规则方案 | 纯LLM方案 | 混合方案（推荐） |
|-----|----------|----------|---------------|
| 成本 | 零 | 高 | 低（仅异常时调用） |
| 延迟 | <1ms | 1-3s | <1ms（大多数情况） |
| 准确率 | 中-高 | 高 | 高 |
| 鲁棒性 | 中 | 高 | 高 |
| 可解释性 | 强 | 弱 | 强 |

### 11.10 总结

**核心设计理念**：
- **规则优先**：80-90%的case由规则处理，零成本零延迟
- **LLM兜底**：仅处理异常case，平衡成本与准确率
- **渐进增强**：规则先行，LLM后补

**关键参数**：
- `SPEAKER_TURN_THRESHOLD_MS = 3500`：说话人切换时间阈值
- `MERGE_GAP_THRESHOLD_MS = 1200`：同一说话人合并时间阈值
- `MAX_SEGMENT_LENGTH = 200`：单段最大字符数

---

*文档版本: 2.0*
*最后更新: 2026-01-13*
