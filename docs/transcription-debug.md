# 实时转写无输出问题：调试记录（本次会话）

## 背景

- 现象：会议中说话后「实时转写」始终无内容；前端控制台仅提示 WebSocket 连接成功。
- 目标：确认音频采集→前端发送→后端接收→豆包 ASR→回传转写 的链路是否打通，并定位阻塞点。

## 结论（已解决）

- 已确认链路贯通，实时转写可正常产出文本。
- 根因：后端到豆包 ASR 的 WebSocket 二进制协议与 Java demo 未对齐（resourceId/Config 是否带序列号/音频与 Config 压缩与字段差异），导致服务端直接 `1006` 断连。
- 收尾修复：结束录音时服务端可能仍以 `1006` 断开（无 close frame），后端已将“主动结束/已发送 final”场景视为预期关闭，不再向前端弹出转写错误。

## 复现与关键日志（节选）

- 前端：
  - `[WebSocket] 连接成功`
  - `[Transcription] 状态消息 { sessionId, status: 'session_set' }`
  - `[Transcription] 状态消息 { status: 'transcribe_started' }`
  - `[AudioCapture] 已开始采集音频 { length, sampleRate: 16000, energy: ... }`
  - `[WebSocket] 发送音频帧 { frames, bytes }`
  - `[Transcription] 状态消息 { status: 'audio_started' }`
  - `转写错误: Doubao WebSocket closed: code=1006 ...`

## 已实施改动（按模块）

### 前端（frontend）

- `frontend/src/services/audioCapture.ts`
  - 修复点：AudioContext 在 `suspended` 时主动 `resume()`，避免 `onaudioprocess` 不触发的“假录音”。
  - 连接方式：新增静音 `GainNode` 作为 sink，避免直连扬声器产生回声/干扰。
  - 可观测性：Dev 环境打印首帧采集日志（长度、采样率、能量）。
  - 策略调整：默认 `bufferSize` 从 `4096` 调整为 `1024`，减少流式 ASR 因分片过大导致的异常断连风险。

- `frontend/src/services/websocket.ts`
  - 可观测性：Dev 环境打印音频帧发送计数（第 1 帧/每 20 帧一次）。
  - 类型：`TranscriptMessage` 增补 `id/status` 字段以兼容后端回传。

- `frontend/src/services/transcription.ts`
  - 协议处理：不再只消费 `isFinal === true`，而是对含 `content` 的转写都处理（支持增量更新）。
  - 展示策略：按 speaker 维护“段落 id”，final 时切段；避免同一段重复追加造成刷屏。
  - 可观测性：Dev 环境打印 `type: 'status'` 状态消息。

- `frontend/src/views/MeetingView.vue`
  - UI 数据更新：对转写结果做 `id` 级别 upsert（存在则替换，不存在则 push）。

### 后端（backend）

- `backend/src/main.ts`
  - 原生 WS：当未先 `set_session` 就发音频时，显式回传 `type: 'error'`（避免静默丢弃）。
  - 音频开始：收到首个二进制音频包时回传 `type: 'status', status: 'audio_started'`。
  - stop 收尾：`stop_transcribe` 时尝试发送最终包并拉取一次最终结果回传（避免最后一句永远不落地）。

- `backend/src/modules/transcript/transcript.service.ts`
  - 增加 `propagateError` 选项：原生 WS 模式需要把 ASR 错误抛出给上层，才能回传给前端；socket.io gateway 仍保持“吞错返回 null”以免影响既有逻辑。
  - 增加 `finalizeAudio()`：用于 stop 时发送最终包并拉取最终结果。

- `backend/src/modules/transcript/doubao.client.ts`
  - 断连诊断增强：在 close 时把 `openMs/config 是否发送/audioBytes/resourceId/modelName` 拼到错误信息里，便于定位。
  - 状态机修复：close/error 后重置 `ws/connectPromise/configPromise`，避免后续无法重连。
  - 配置扩展：支持通过环境变量覆盖 `model_name/enable_itn/enable_punc`（避免硬编码）。
    - `TRANSCRIPT_MODEL_NAME`
    - `TRANSCRIPT_ENABLE_ITN`（`true/false/1/0`）
    - `TRANSCRIPT_ENABLE_PUNC`（`true/false/1/0`）
  - 协议兼容性：Config 默认改为 `gzip` 压缩 JSON（可用 `TRANSCRIPT_CONFIG_GZIP=false` 关闭），并在重连时重置 `seq/统计` 便于定位。

## 已完成的验证

- 前端最小验证：`frontend/src/services/transcription.spec.ts` 通过（只跑该用例）。
- 后端最小验证：TypeScript 编译通过（仅针对改动路径；后端项目全量 `tsc` 存在既存报错，不在本次任务范围内）。

## 当前状态

- 链路已打通，转写正常。
- 若再次出现 `1006`：优先对齐 `TRANSCRIPT_ENDPOINT` + `TRANSCRIPT_RESOURCE_ID`（以你实际开通资源为准），其次再尝试切换 `TRANSCRIPT_CONFIG_GZIP` / `TRANSCRIPT_AUDIO_GZIP`。

## 运行建议（保留）

1. 优先按 Java demo 口径配置并复测：
   - `TRANSCRIPT_ENDPOINT=wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`
   - `TRANSCRIPT_RESOURCE_ID=volc.bigasr.sauc.duration`
2. 若你实际开通的是 seedasr 规格，则改用对应 resourceId：
   - `volc.seedasr.sauc.duration` / `volc.seedasr.sauc.concurrent`
3. 若服务端对压缩不兼容，可临时切换：
   - `TRANSCRIPT_CONFIG_GZIP=false`
   - `TRANSCRIPT_AUDIO_GZIP=false`

## 参考

- 官方文档：<https://www.volcengine.com/docs/6561/1354869?lang=zh>
