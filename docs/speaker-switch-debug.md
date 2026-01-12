# 多人说话人自动切换不准确：Debug 文档

## 背景与现象

在多人会议场景中，期望转写记录能按说话人切分，例如：`A → B → A` 应生成 3 条发言记录。

当前现象：
- 仍可能出现 **A 与 B 的对话夹在同一条记录** 中（例如 A 的句子里混入 B 的“嗯/有的”等短回应）。
- 即便有“分段”，也可能 **切段不稳定/重复/不符合说话人边界**。

## 核心结论（先说清楚边界）

1. **仅凭单路混音音频（一个麦克风/一个音轨）无法可靠“凭空识别是谁在说话”**。  
   要真正做到自动区分讲述者，必须满足至少一个条件：
   - 上游 ASR 在返回中提供了 diarization（说话人分离）字段（例如 `speaker_id/spk_id/speaker`），或
   - 音频采集为“多轨/多通道”（每人独立音轨或设备），可以明确绑定来源。

   补充：**单路混音音频依然“可能”做出无监督的说话人分离（输出 `SPEAKER_00/01` 这类匿名标签）**，但它解决的是“分群/分段”，不是“身份识别”。要把匿名 speaker 映射到真实姓名/参会人，通常仍需要：声纹注册（voiceprint enrollment）/多设备绑定/手动标注等外部信息。

2. 当前系统的“切段”更多是基于 utterance/停顿/文本重置等启发式策略，**能改善段落颗粒度，但不等价于说话人识别**。

## 目标

- 快速判断：豆包 ASR 返回里是否包含可用的说话人字段（diarization）。
- 若有：补齐字段解析，按 speaker 可靠切段。
- 若无：明确是“能力缺失”还是“参数/链路问题”，并给出可行替代方案（按停顿切段/手动标注/接入 diarization）。

## 调试开关

### 1) 打开 utterances 调试日志（后端）

后端支持在非生产环境打印每次识别结果的 utterances 摘要：

- 环境变量：`TRANSCRIPT_DEBUG_LOG_UTTERANCES=1`
- 位置：`backend/src/modules/transcript/transcript.service.ts`
- 备注：当前配置请求里已默认开启 `show_utterances=true`（`backend/src/modules/transcript/doubao.client.ts`），因此只要上游能力/权限支持，响应中就应出现 `utterances` 供解析与切段。
- 输出内容包含：
  - `len`：utterances 数量
  - `segmentKey`：用于切段的键
  - `speakerId`：解析到的 speakerId（若存在）
  - `preview`：文本片段预览
  - `keys`：utterance record 的字段列表（用于判断上游是否提供 speaker 字段）

建议只在调试期间打开，避免日志噪音。

### 2) 调整“自动切段”兜底阈值（后端，可选）

当上游缺少稳定 `segmentKey` 或 speaker 字段时，系统会用“长间隔/文本重置”做兜底切段：

- 环境变量：`TRANSCRIPT_AUTO_SPLIT_GAP_MS`
  - 默认：`2500`
  - 调小（例如 `800`）会更容易切段，但会增加碎片化与误切。

位置：`backend/src/main.ts`

### 3) 开启“按停顿出句 + 匿名 speaker 聚类”模式（后端，可选）

适用场景：**单麦克风混音**，且产品允许“停顿后一次性出一句”，speaker 只需要显示为匿名 `发言者1/2/3...`。

核心思路：
- 先用 VAD/停顿检测把音频切成 turn（一个人连续说话的一段）。
- turn 结束后再拿最终 ASR 文本并落库（不广播中间结果）。
- turn 级别提 speaker embedding，做会话内聚类，得到匿名 speakerId（`SPEAKER_xxx`）。

开关与参数：
- `TRANSCRIPT_TURN_MODE=1`：开启 turn 模式（仅在原生 WebSocket `/transcript` 链路生效）。
- `TRANSCRIPT_TURN_GAP_MS`：判定停顿结束的阈值（默认 `1000`，建议 `800~1200`）。
- `TRANSCRIPT_TURN_SILENCE_RMS_TH`：静音 RMS 阈值（默认 `550`，不同麦克风需校准）。
- `TRANSCRIPT_TURN_MIN_FINALIZE_VOICED_MS`：一个 turn 最小有效语音时长（默认 `250`，太大可能导致短句不落库）。
- `TRANSCRIPT_TURN_MIN_EMBEDDING_VOICED_MS`：提取 embedding 的最小有效语音时长（默认 `900`）。
- 兼容：旧变量 `TRANSCRIPT_TURN_MIN_VOICED_MS` 仍可用，等价于设置 `TRANSCRIPT_TURN_MIN_EMBEDDING_VOICED_MS`。

匿名 speaker 聚类（需要外部 embedding 服务）：
- `TRANSCRIPT_TURN_EMBEDDING_URL`：HTTP 服务地址，POST PCM 返回 `embedding`。
- `TRANSCRIPT_TURN_SPK_SAME_TH`：归为同一 speaker 的相似度阈值（默认 `0.75`）。
- `TRANSCRIPT_TURN_SPK_NEW_TH`：判定新 speaker 的阈值（默认 `0.60`）。

`TRANSCRIPT_TURN_EMBEDDING_URL` 约定：
- Request（JSON）：`{ format: "pcm_s16le", sampleRate: 16000, channels: 1, audioBase64: "..." }`
- Response（JSON）：`{ embedding: number[] }`

备注：未配置 `TRANSCRIPT_TURN_EMBEDDING_URL` 时，turn 模式仍可工作（停顿出句），但 speaker 将不会自动切换。

前端发包建议（可选但推荐）：
- 当检测到“停止说话/持续静音”时，**停止发送音频帧**，并通过 WebSocket 发送控制消息：`{ "type": "end_turn" }`，让后端立即封口落库。
- 前端本地 VAD 参数可通过以下环境变量调整（默认值已内置）：
  - `VITE_TRANSCRIPT_VAD_START_TH`（默认 `0.015`）：开始说话阈值（能量高于该值才开始发包）
  - `VITE_TRANSCRIPT_VAD_STOP_TH`（默认 `0.01`）：静音判定阈值（能量低于该值开始累计静音）
  - `VITE_TRANSCRIPT_VAD_GAP_MS`（默认 `900`）：静音持续多久触发 `end_turn`

## 复现步骤（推荐）

1. 启动前端与后端（开发环境）。
2. 开启 `TRANSCRIPT_DEBUG_LOG_UTTERANCES=1`。
3. 选择一个会话，开始录音。
4. 两个人交替说短句，刻意制造 `A → B → A` 场景（尤其包含“嗯/是的/好的”等插话）。
5. 记录以下信息：
   - 前端界面中出现“夹在一起”的那条发言（内容片段 + 时间点）。
   - 后端日志中对应时间点的 `Doubao utterances ... keys=...` 行。

## 判定流程（最关键）

### A. utterances 是否包含 speaker 字段？

查看日志 `keys=...`：
- **若包含**类似字段：
  - `speaker_id` / `speakerId`
  - `spk_id` / `spkId`
  - `speaker`（对象内含 `id/name`）
  
结论：上游提供了 diarization 信号，下一步应 **补齐字段解析并按 speaker 切段**。

- **若不包含任何 speaker 字段**
  
结论：上游没有 diarization 信息。此时出现 A/B 文本混在一起是预期现象，系统无法可靠拆分。

### B. segmentKey 是否稳定？

日志里 `segmentKey=...`：
- **稳定且递增/可定位**：可用于按 utterance 切段（更接近“逐句”）。
- **频繁变化且无规律**：可能被误选为 `seq/id` 等“每帧变化字段”，会导致过度切段或重复。

## 常见原因与对策

### 1) 上游无 diarization：只能“按段落”而非“按说话人”

对策（按优先级）：
- 方案 1：启用/切换到支持 diarization 的 ASR 能力（如果豆包支持需开通/配置）。
- 方案 2：多设备/多轨采集（每人一个麦克风/音轨，后端合并时天然可区分）。
- 方案 3：仅做“按停顿切段 + 手动标注说话人”（产品层面可接受时）。

## 联网可行性结论（用于选型，不替代本地调试）

结论：**“单路混音 + 自动 diarization/说话人分离”在业界是成熟能力**，并且在部分厂商支持“实时/流式”返回 speaker 标签。若豆包上游无法提供 diarization 字段，可以考虑：
- 直接切换到支持 diarization 的 ASR（云服务侧完成），或
- 在后端引入 diarization/声纹服务（自建或第三方）做补偿。

可参考的公开资料：
- Google Cloud Speech-to-Text：Speaker diarization（支持在请求中开启并给每个词打 speaker label）  
  https://cloud.google.com/speech-to-text/docs/multiple-voices
- Azure Speech：Conversation transcription with real-time diarization（结果包含 Speaker ID）  
  https://learn.microsoft.com/en-us/azure/ai-services/speech-service/conversation-transcription
- Amazon Transcribe：speaker diarization / speaker partitioning（文档中包含 batch 与 streaming 的参数示例）  
  https://docs.aws.amazon.com/transcribe/latest/dg/diarization.html

说明：上述 diarization 返回的 `speakerId` 通常是服务端临时分配的匿名标识，并不等价于“参会人身份”。若业务需要“张三/李四”，仍需要额外的身份绑定机制。

## 补充：后端通过音色/声纹区分 speaker 的可能性（单路混音）

> 目标拆解：先“分离/分群”，再“命名/绑定”。不要把“说话人分离(diarization)”与“身份识别(voiceprint)”混为一谈。

### A. 无监督说话人分离（Diarization：把音频切成若干 speaker 段）

可行：对整段音频做 VAD/分段 + speaker embedding 聚类，输出形如 `SPEAKER_00/01` 的时间片段。再把 ASR 文本按时间戳映射到 speaker 段即可完成 `A→B→A` 的“匿名 speaker”切分。

工程落地建议（更符合现有系统的 KISS/YAGNI 路径）：
- **优先离线（录音结束后/回放场景）**：一次性对完整音频做 diarization，质量和稳定性通常好于强实时；并且更容易用“全局聚类”减少 speaker 漂移。
- **实时（边录边出）属于增强项**：需要滑窗/增量聚类/延迟策略，复杂度与不确定性显著提升，建议在上游 diarization 缺失且产品强依赖实时 speaker 时再做。

开源方案参考：
- `pyannote.audio`：Python 说话人分离工具包，提供现成 pipeline 与示例代码（亦提到 voiceprinting 等能力）  
  https://github.com/pyannote/pyannote-audio

### B. 声纹/音色识别（Voiceprint：把匿名 speaker 绑定到“已知的人”）

前提：需要“已知说话人”的注册样本（enrollment），并且要明确合规边界（声纹属于生物识别特征，涉及隐私与合规）。

典型做法：
- 为每个参会人保存一段注册语音的 embedding（或多段求均值）。
- diarization 得到的每个 speaker 段计算 embedding，与已注册的 embeddings 做相似度匹配（阈值控制拒识/误识）。

开源生态参考（speaker recognition 方向）：
- SpeechBrain 项目包含 speaker recognition 相关配方与模型路线（如 ECAPA-TDNN、x-vector 等）  
  https://github.com/speechbrain/speechbrain

### C. 与当前链路的集成形态（建议顺序）

1) **上游优先**：若豆包可提供 diarization 字段，优先走“上游 speaker → 后端纯解析/切段”，实现成本最低、实时性最好。  
2) **离线补偿**：若上游无 diarization，但产品可接受“会后/回放时更准确”，引入后端离线 diarization 服务做二次加工。  
3) **实时补偿**：仅在强实时且上游无法提供 diarization 时考虑；需要更完整的工程投入与指标体系（延迟、漂移、重叠说话、误切等）。

### 2) VAD/插话导致同一句混入短词

表现：A 的句子中混入 B 的“嗯/对/有的”，且 ASR 输出在一个连续 utterance 内。

对策：
- 若有 speaker 字段：按 speaker 强切段。
- 若无 speaker 字段：只能通过更激进的启发式（更短 gap、文本重置阈值）减少“长段”，但无法保证准确归属。

### 3) 过度切段/重复片段

表现：一句话被切成很多条，或内容重复出现。

对策：
- 确认 `segmentKey` 选取是否来自稳定字段（`utterance_id/start_time` 优先）。
- 调大 `TRANSCRIPT_AUTO_SPLIT_GAP_MS`，减少兜底切段触发。

## 需要你提供的最小信息（用于继续修复）

请粘贴一行后端日志（包含 `keys=...`）以及对应的前端“夹在一起”文本片段：
- `Doubao utterances len=... segmentKey=... speakerId=... preview=... keys=...`

有了 `keys`，才能确定：
- 是上游未提供 diarization（能力缺失），还是
- 上游提供了字段但我们没解析到（实现问题，可修）。
