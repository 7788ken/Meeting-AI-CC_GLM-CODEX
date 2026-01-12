# 实时转写重构方案：ASR 原文流 + GLM 轮次分段（落库）

## 目标（按你确认的约束）

1. **说话人轮次分段**：输出按 speaker turn（同一 speaker 连续发言）组织的段落结构。
2. **原文结构化**：LLM 只能做结构化/分段，不允许改写、润色、补写原文。
3. **分段落库**：会议进行中持续落库，刷新页面可恢复最新原文与分段结果。
4. **GLM 持续处理**：每 `3s` 触发一次（去抖），并在“停顿后”（`end_turn`）强制触发一次。

## 背景与问题（为何要解耦）

当前链路把“ASR 输出”直接映射成 `Speech` 段落并实时展示。流式 ASR 常见的 **纠错回写、句子重置、utterance 数组重排** 会导致：
- UI 出现重复段落/插入错位（段落边界不稳定）。
- 业务逻辑被迫在“实时性 vs 正确性”间做大量启发式折中。

因此将链路拆成两步：
- Step 1：ASR 只负责产出 **可追溯的原文事件流**（允许回写更新）。
- Step 2：LLM（GLM）只负责在事件流之上做 **轮次分段结构化**（可重算、可版本化、可校验）。

## 总体架构（建议形态）

```
Frontend AudioCapture
  -> WS /transcript (PCM)
    -> Backend ASR (Doubao streaming)
      -> Realtime Transcript Store (append-only events + last-updated)
        -> WS broadcast: transcript_event_upsert
      -> Segmentation Scheduler (debounce 3s + end_turn trigger)
        -> GLM (structure-only, no rewrite)
          -> Turn Segments Store (versioned, persisted)
            -> WS broadcast: turn_segments_upsert / snapshot

UI:
  - 原文流视图：按事件流实时滚动展示（不切段）
  - 轮次分段视图：按 speaker turn 展示分段结果（可重算/可回放）
```

## 数据模型（Mongo / Mongoose）

### 1) `transcript_events`（原文事件流）

**用途**：ASR 的“可回写”输出以事件形式落库，事件是 UI 与 LLM 的唯一事实来源。

建议字段：
- `sessionId: string`（index）
- `eventIndex: number`（per session 单调递增，unique: `{sessionId, eventIndex}`）
- `speakerId: string`
- `speakerName: string`
- `content: string`（允许被后续更新覆盖）
- `isFinal: boolean`（可选：ASR 提供时写入）
- `segmentKey?: string`（来自 ASR 的稳定 utterance key，用于命中同一事件并更新）
- `asrTimestampMs?: number`
- `createdAt/updatedAt`

**关键策略**：
- 后端维护 `segmentKey -> eventIndex` 的映射（每 WS client、每 session），使“同一句的回写”更新到同一 `eventIndex`，避免重复 append。

### 2) `transcript_state`（会话级状态）

**用途**：保存 `nextEventIndex`、`revision`、最近一次 LLM 分段覆盖到的 revision 等，支持幂等调度。

建议字段：
- `sessionId: string`（unique）
- `nextEventIndex: number`
- `revision: number`（任何 event upsert 递增）
- `lastSegmentedRevision: number`
- `updatedAt`

### 3) `turn_segments`（轮次分段结果）

**用途**：存放 LLM 产出的“结构化分段”，并与原文事件用索引关联。

建议字段：
- `sessionId: string`（index）
- `revision: number`（该结果基于的 `transcript_state.revision`）
- `segments: Array<{ speakerId: string; speakerName: string; startEventIndex: number; endEventIndex: number }>`
- `generatedAt: Date`
- `model: 'glm' | ...`
- `status: 'processing' | 'completed' | 'failed'`
- `error?: string`

**注意**：为保证“原文不被改写”，`turn_segments` 不需要存 `content`，UI 渲染时从 `transcript_events` 按索引拼接即可；若为了性能存 `content`，必须做严格校验（见下文）。

## WebSocket 协议（/transcript，新增消息）

保持现有控制消息不变（`set_session/start_transcribe/stop_transcribe/end_turn`），新增下行：

### 1) 原文事件更新（实时）

```json
{
  "type": "transcript_event_upsert",
  "data": {
    "sessionId": "s1",
    "revision": 123,
    "event": {
      "eventIndex": 42,
      "speakerId": "speaker-a",
      "speakerName": "发言者 A",
      "content": "不过可能",
      "isFinal": false
    }
  }
}
```

### 2) 分段结果更新（异步）

```json
{
  "type": "turn_segments_upsert",
  "data": {
    "sessionId": "s1",
    "revision": 123,
    "status": "completed",
    "segments": [
      { "speakerId": "speaker-a", "speakerName": "发言者 A", "startEventIndex": 40, "endEventIndex": 45 }
    ]
  }
}
```

## GLM 调度策略（3 秒 + 停顿后）

### 触发条件
- **去抖定时**：同一 `sessionId` 在 `3s` 窗口内多次事件更新，只触发一次 LLM。
- **停顿强触发**：收到 `end_turn`（前端 VAD 已实现发送）后立即触发一次。
- **停止强触发**：`stop_transcribe` 后立即触发最终一次（可选：等待 ASR finalize）。

### 幂等与并发
- 同一 session 同时只允许 1 个 LLM 任务在跑。
- 任务输入包含 `targetRevision`；如果任务返回时 `transcript_state.revision > targetRevision`，结果标记为过期可丢弃或降级合并。

## GLM 输出约束（原文结构化，禁止改写）

### 输入（建议）
向 GLM 提供最近一段窗口的事件（例如最后 200 条），以及每条事件的 `speakerId/speakerName/content/eventIndex`。

### 输出（强制 JSON）
只允许输出“索引范围分段”，禁止输出新文本：

```json
{
  "segments": [
    { "speakerId": "speaker-a", "speakerName": "发言者 A", "startEventIndex": 40, "endEventIndex": 45 }
  ]
}
```

### 校验（后端必须做）
- `startEventIndex/endEventIndex` 必须在已存在事件索引范围内。
- `segments` 必须按时间顺序、无重叠。
- 每个 segment 内允许包含多个事件，但必须保持“同一 speaker 连续轮次”。
- 若任何校验失败：丢弃本次结果并保留上一次成功结果。

## 前端 UI 改造（MeetingView）

### 目标交互
- 左侧：**原文流**（滚动容器，按事件追加/更新；不切段，不插入重复）。
- 右侧：**轮次分段**（分段列表，按 speaker turn 展示；3 秒刷新 + 停顿即时刷新）。

### 推荐组件拆分（SOLID / SRP）
- `RealtimeTranscriptPanel.vue`：仅负责展示 `transcript_events` 的流式视图。
- `TurnSegmentsPanel.vue`：仅负责展示 `turn_segments` 的结构化视图。
- `useTranscriptStreamStore`：管理 WS 订阅、事件缓存、revision、恢复加载。
- `useTurnSegmentationStore`：管理分段结果、状态、错误、刷新策略。

## 迁移计划（分阶段）

### Phase 0：协议与开关（不改现网默认）
- 增加 env 开关：`TRANSCRIPT_PIPELINE=legacy|raw_llm`（默认 legacy）。
- WS 增加 `transcript_event_upsert` 与 `turn_segments_upsert` 的数据结构（仅在 raw_llm 时发送）。

### Phase 1：原文事件流落库 + UI 原文流
- 后端：实现 `transcript_events/transcript_state` 写入与恢复接口（REST + WS）。
- 前端：MeetingView 增加“原文流”面板（不替换现有 speech 列表，先并行显示）。
- 验收：刷新后原文能恢复；不会出现插入/重复段落（事件索引稳定）。

### Phase 2：GLM 分段服务 + 落库 + UI 分段
- 后端：新增 Segmentation Scheduler；接入 GLM；落库 `turn_segments`；WS 推送。
- 前端：新增“轮次分段”面板；展示分段状态（processing/completed/failed）。
- 验收：3 秒内更新、停顿后即时更新；分段仅结构化不改写。

### Phase 3：收敛旧链路（可选）
- 将 legacy 的 `Speech` 生成逻辑下线或仅保留“会后整理”。
- 需要兼容 “标记/编辑/AI 分析” 时，再决定是否把 `turn_segments` 映射为 `Speech`（或新增转换按钮）。

## 验收标准（建议）

- **稳定性**：会议进行中不出现“重复段落/插入错位”的 UI 问题（原文流按 eventIndex 更新）。
- **时效性**：分段视图更新延迟 `<= 4s`（3s 去抖 + 网络/模型延迟）。
- **一致性**：分段结果可由事件流完全重建；LLM 输出不包含原文之外内容。
- **可恢复**：刷新页面可恢复原文事件与最近一次分段结果。
- **可回滚**：切回 legacy 管线不影响会议基本功能。

## 灰度与回滚策略（建议）

### 开关
- 后端：`TRANSCRIPT_PIPELINE=legacy|raw_llm`（默认 `legacy`）
- 分段调度：`TRANSCRIPT_SEGMENT_INTERVAL_MS=3000`、`TRANSCRIPT_SEGMENT_TRIGGER_ON_END_TURN=1`
- 模型：`DEFAULT_AI_MODEL=glm`（复用现有配置）

### 回滚
- 任意时刻可将 `TRANSCRIPT_PIPELINE` 切回 `legacy`，WS 仍维持旧消息类型，前端原有 `TranscriptDisplay` 不受影响。
- `raw_llm` 管线下若 GLM 不可用/失败：
  - UI 仍展示原文流；
  - 分段维持上一次成功结果（或显示“处理中/失败”），不阻塞会议流程。

### 指标（便于定位问题）
- 每 session 的：
  - `transcript_state.revision` 增长速率（事件更新频率）
  - 分段任务耗时（p50/p95），失败率
  - WS 下行消息量（events/segments）

## 工程实现拆分（可直接开工）

### 后端（NestJS）

**模块建议：**
- `backend/src/modules/transcript-stream/`（新模块，单一职责：原文事件流落库 + WS 广播）
  - `transcript-event.schema.ts`（`transcript_events`）
  - `transcript-state.schema.ts`（`transcript_state`）
  - `transcript-stream.service.ts`（`upsertEvent()`、`getSnapshot()`）
  - `transcript-stream.controller.ts`（REST：恢复/查询）
- `backend/src/modules/turn-segmentation/`（新模块，单一职责：LLM 轮次分段）
  - `turn-segments.schema.ts`（`turn_segments`）
  - `turn-segmentation.scheduler.ts`（debounce 3s + end_turn 强触发）
  - `turn-segmentation.service.ts`（组装上下文、调用 GLM、校验、落库、广播）
  - `turn-segmentation.prompt.ts`（只输出 JSON 的提示词构建）

**与现有模块的衔接点：**
- `ModelManagerService` / `GlmClient` 当前面向“会议分析 Markdown 文本”，不适合直接复用为“结构化 JSON”输出。
  - 建议新增一个面向结构化输出的接口，例如：
    - `GlmClient.generateStructuredJson(params)`：强制系统 prompt + 只允许 JSON，失败时返回错误；
    - 或新增 `TurnSegmentationGlmClient`（组合复用 HttpService 与鉴权逻辑，避免污染现有分析 prompts）。

### 前端（Vue）

**组件建议：**
- `frontend/src/components/RealtimeTranscriptPanel.vue`：展示原文事件流（按 `eventIndex` 更新同一事件，避免重复）。
- `frontend/src/components/TurnSegmentsPanel.vue`：展示轮次分段（按 segment ranges 从事件流拼接文本）。

**状态与服务建议：**
- `frontend/src/stores/transcriptStream.ts`：缓存事件流与 revision，并提供 `getTextByRange()`。
- `frontend/src/stores/turnSegmentation.ts`：缓存分段结果、状态、错误。
- `frontend/src/services/websocket.ts`：增加消息类型解析与分发（`transcript_event_upsert` / `turn_segments_upsert`）。

## 任务拆解（建议 Issue 列表）

### B1：原文事件流（后端）
- [ ] 增加 env 开关：`TRANSCRIPT_PIPELINE=legacy|raw_llm`
- [ ] 在 WS `/transcript` 处理转写结果处，写入 `transcript_events/transcript_state`（按 `segmentKey` 命中同一事件做 update）
- [ ] 下行广播 `transcript_event_upsert`
- [ ] REST：`GET /transcript-stream/session/:sessionId` 返回事件快照与 revision（供刷新恢复）

### B2：轮次分段（后端）
- [ ] 调度器：每 session 去抖 `3000ms`；收到 `end_turn`/`stop_transcribe` 立即触发
- [ ] GLM prompt：输入事件窗口；输出 segments（索引范围）；禁止输出新文本
- [ ] JSON 解析 + schema 校验（范围/顺序/同 speaker 连续轮次）
- [ ] `turn_segments` 落库 + 下行广播 `turn_segments_upsert`
- [ ] REST：`GET /turn-segmentation/session/:sessionId` 返回最新分段结果

### F1：UI 原文流
- [ ] MeetingView 增加“原文流”面板（与现有 `TranscriptDisplay` 并行，先不删旧功能）
- [ ] 支持刷新恢复：页面加载时调用 REST 获取事件快照

### F2：UI 轮次分段
- [ ] MeetingView 增加“轮次分段”面板（展示分段状态、错误提示）
- [ ] 由 `segments` + `events` 渲染内容（不相信 LLM 的 content）

### 质量与回归
- [ ] 后端单测：segmentKey->eventIndex 命中更新、revision 幂等、分段校验拒绝越界
- [ ] 前端单测：事件 upsert 去重、分段渲染与范围拼接
