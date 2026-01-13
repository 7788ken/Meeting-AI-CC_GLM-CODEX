# 语义分段窗口模式设计

> 创建时间: 2026-01-13
> 来源: Claude Code + Codex CLI + 用户讨论

---

## 一、问题背景

### 1.1 ASR 错误分段问题

当前豆包 ASR 会错误地将一句话拆分成多段，例如：

```
段1: "1-模块之间互相协作有没有什么问题？这个端到端的测试的话就是主要"
段2: "2-这个端到端的测试的话，就是主要是针对一些核心的流程..."
```

问题特征：
- "1-" "2-" 是说话人标记被错误包含在内容里
- 第一段语义不完整，是断句
- 同一说话人的连续发言被错误拆分

### 1.2 批次模式的局限性

原 `CHUNK_SIZE` 是**批次模式**：
- CHUNK_SIZE=2: 第1批处理[0,1]，第2批处理[2,3]...
- 处理事件13时，LLM 只能看到 [12,13]，看不到前后文
- 无法判断 [12,13] 是否应该合并

---

## 二、窗口模式设计

### 2.1 核心概念

**窗口模式**：处理事件 N 时，提供前后各 K 条事件作为上下文

```
WINDOW_SIZE=2 时:
┌─────────────────────────────────────────────────────────────┐
│ 事件流: [0][1][2][3][4][5][6][7][8][9]...[13][14][15]...     │
├─────────────────────────────────────────────────────────────┤
│ 处理事件13: LLM 看到 [11][12][13][14][15]                    │
│ 处理事件14: LLM 看到 [12][13][14][15][16]                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 与批次模式对比

| 维度 | 批次模式 | 窗口模式 |
|------|---------|---------|
| 处理13时看到 | [12,13] | [11,12,13,14,15] |
| 处理粒度 | 按批次 | 按条 |
| 上下文 | 仅向后 | 前后都有 |
| 适合场景 | 批量离线处理 | 实时逐条处理 |

### 2.3 窗口模式优势

1. **能看到前后文**：LLM 能判断当前句与前后句是否应该合并
2. **逐条处理**：每条转写到达后立即处理，真正实时
3. **修复断句**：能检测到 "主要" + "这个端到端" 这种应该合并的情况

---

## 三、实现方案

### 3.1 代码改动

**文件**: `backend/src/modules/transcript-analysis/transcript-analysis.service.ts`

**原逻辑（批次模式）**:
```typescript
const startEventIndex = Math.max(0, state.lastAnalyzedEventIndex + 1)
const maxEnd = Math.min(maxAvailable, startEventIndex + chunkSize - 1)
```

**新逻辑（窗口模式）**:
```typescript
// 当前要处理的事件
const targetEventIndex = Math.max(0, state.lastAnalyzedEventIndex + 1)

// 窗口范围：前后各 WINDOW_SIZE 条
const windowSize = this.readChunkSize()  // 复用 CHUNK_SIZE 作为窗口大小
const windowStart = Math.max(0, targetEventIndex - windowSize)
const windowEnd = Math.min(maxAvailable, targetEventIndex + windowSize)

// 获取窗口内所有事件
const windowEvents = await this.transcriptStreamService.getEventsInRange({
  sessionId,
  startEventIndex: windowStart,
  endEventIndex: windowEnd,
})

// LLM 处理时，标记目标事件
const { dialogues } = await this.analyzeEventsWithWindow({
  sessionId,
  targetEventIndex,      // 重点处理这一条
  windowEvents,          // 完整窗口上下文
})
```

### 3.2 Prompt 调整

**文件**: `backend/src/modules/transcript-analysis/transcript-analysis.prompt.ts`

```typescript
const system = [
  '你是"会议语义分段器"。你的任务是：判断目标事件是否应与前后事件合并。',
  '',
  '输入：',
  '- windowEvents: 窗口内所有事件（含前后文）',
  '- targetEventIndex: 本次需要重点处理的事件索引',
  '',
  '输出：',
  '- 如果目标事件应与前后合并，返回合并后的 dialogue',
  '- 如果目标事件独立，返回独立的 dialogue',
  '- startEventIndex/endEventIndex 必须准确反映合并范围',
].join('\n')
```

### 3.3 配置参数

```bash
# 窗口大小：前后各取几条作为上下文
TRANSCRIPT_ANALYSIS_WINDOW_SIZE=2       # 前后各2条，共5条上下文

# 向后兼容：如果设置 CHUNK_SIZE，等同于 WINDOW_SIZE
TRANSCRIPT_ANALYSIS_CHUNK_SIZE=2        # 复用此参数
```

---

## 四、合并检测逻辑

### 4.1 检测条件（窗口模式下的判断规则）

相邻两段是否合并，判断条件：

```typescript
function shouldMergeWithWindow(
  target: Event,
  prev: Event | null,
  next: Event | null
): { shouldMerge: boolean; direction: 'prev' | 'next' | 'both' | null; reason: string } {

  // 条件1: 同一说话人
  const sameSpeaker = prev?.speakerId === target.speakerId
  const sameSpeakerNext = next?.speakerId === target.speakerId

  // 条件2: 时间间隔短（< 500ms 表示可能是错误分段）
  const gapPrev = prev ? target.timestamp - prev.timestamp : Infinity
  const gapNext = next ? next.timestamp - target.timestamp : Infinity
  const shortGapPrev = gapPrev < 500
  const shortGapNext = gapNext < 500

  // 条件3: 前一段未完（缺强终止标点）
  const hasStrongEnd = prev ? /[。！？；]$/.test(prev.content) : true
  const incompleteEnd = !hasStrongEnd

  // 条件4: 前一段结尾是"未完词"或后一段开头是"延续词"
  const incompleteEndWords = /(就是|然后|我们|主要|的|而且|因为|所以)$/.test(prev?.content || '')
  const continuationStart = /^(这个|然后|就是|所以|我们|\d+\s*[-—:])/.test(target.content)

  // 条件5: 可疑编号前缀（如 "1-", "2-"）
  const hasSuspiciousPrefix = /^\d+\s*[-—:：]/.test(target.content)

  // 判断逻辑
  const mergePrev = prev && sameSpeaker && shortGapPrev && (incompleteEnd || continuationStart || hasSuspiciousPrefix)
  const mergeNext = next && sameSpeakerNext && shortGapNext && incompleteEndWords

  if (mergePrev && mergeNext) {
    return { shouldMerge: true, direction: 'both', reason: '前后都可合并' }
  }
  if (mergePrev) {
    return { shouldMerge: true, direction: 'prev', reason: '与上一段合并' }
  }
  if (mergeNext) {
    return { shouldMerge: true, direction: 'next', reason: '与下一段合并' }
  }
  return { shouldMerge: false, direction: null, reason: '保持独立' }
}
```

---

## 五、实施步骤

### Phase 1: 修改数据获取逻辑
- [ ] 修改 `processSession` 从批次模式改为窗口模式
- [ ] 添加 `analyzeEventsWithWindow` 方法

### Phase 2: 调整 Prompt
- [ ] 修改 Prompt 以支持窗口上下文
- [ ] 添加 `targetEventIndex` 参数

### Phase 3: 更新验证逻辑
- [ ] 调整 validation.ts 支持窗口输出
- [ ] 确保输出范围准确

### Phase 4: 测试
- [ ] 单元测试：窗口边界条件
- [ ] 集成测试：完整流程
- [ ] 回归测试：前端兼容性

---

## 六、环境配置

```bash
# ========== 窗口模式配置 ==========
# 窗口大小：前后各取几条作为上下文（默认2）
TRANSCRIPT_ANALYSIS_WINDOW_SIZE=2

# 或使用兼容参数
TRANSCRIPT_ANALYSIS_CHUNK_SIZE=2

# ========== 其他配置 ==========
TRANSCRIPT_ANALYSIS_CONCURRENCY=3            # 最大并发会话数
TRANSCRIPT_ANALYSIS_REQUIRE_FINAL=true        # 只处理 isFinal=true 事件（推荐）
```

---

## 七、示例

### 输入（10条事件）

```json
{
  "windowEvents": [
    { "eventIndex": 11, "speakerId": "A", "content": "我们今天讨论" },
    { "eventIndex": 12, "speakerId": "A", "content": "模块之间协作" },
    { "eventIndex": 13, "speakerId": "A", "content": "1-有没有什么问题？这个端到端的测试的话就是主要" },
    { "eventIndex": 14, "speakerId": "A", "content": "2-这个端到端的测试，就是主要是针对一些核心的流程" },
    { "eventIndex": 15, "speakerId": "A", "content": "我们会去模拟用户的操作" }
  ],
  "targetEventIndex": 13
}
```
```json
{
  "windowEvents": [
    { "eventIndex": 12, "speakerId": "A", "content": "模块之间协作" },
    { "eventIndex": 13, "speakerId": "A", "content": "1-有没有什么问题？这个端到端的测试的话就是主要" },
    { "eventIndex": 14, "speakerId": "A", "content": "2-这个端到端的测试，就是主要是针对一些核心的流程" },
    { "eventIndex": 15, "speakerId": "A", "content": "我们会去模拟用户的操作" },
    { "eventIndex": 16, "speakerId": "A", "content": "方式，并且测试结果会保存下" },

  ],
  "targetEventIndex": 14
}
```
### 输出（合并后）

```json
{
  "dialogues": [{
    "speakerId": "A",
    "speakerName": "张三",
    "startEventIndex": 11,
    "endEventIndex": 15,
    "content": "模块之间协作，有没有什么问题？这个端到端的测试的话就是主要针对一些核心的流程，我们会去模拟用户的操作"
  }]
}
```
```json
{
  "dialogues": [{
    "speakerId": "A",
    "speakerName": "张三",
    "startEventIndex": 12,
    "endEventIndex": 16,
    "content": "模块之间协作，有没有什么问题？这个端到端的测试的话就是主要针对一些核心的流程，我们会去模拟用户的操作方式，并且测试结果会保存下"
  }]
}
```
---

*文档版本: 1.0*
*最后更新: 2026-01-13*
