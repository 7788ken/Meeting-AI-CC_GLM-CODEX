# 豆包语音流识别 2.0 使用文档

> 最后更新: 2026-01-11
> 维护者: Claude Code (repo-wiki skill)

## 目录
- [服务概述](#服务概述)
- [认证配置流程](#认证配置流程)
- [二进制协议详解](#二进制协议详解)
- [端到端数据流](#端到端数据流)
- [故障排查指南](#故障排查指南)
- [代码示例](#代码示例)

---

## 服务概述

豆包语音流识别 2.0 通过 WebSocket 连接豆包 ASR 服务，使用二进制协议发送配置与音频帧，并接收实时转写结果。当前实现包含两条数据路径：

- 前端采集麦克风音频，转换为 PCM 16kHz/16-bit/单声道 Int16Array 后通过原生 WebSocket 二进制发送。
- 后端将 PCM 帧封装为豆包二进制协议包（Config + Audio），并解析豆包返回的 Response。

相关实现位置：
- 音频采集与 PCM 转换：frontend/src/services/audioCapture.ts:32, frontend/src/services/audioCapture.ts:148
- 前端发送二进制帧：frontend/src/services/websocket.ts:199
- 后端处理二进制音频：backend/src/modules/transcript/transcript.service.ts:84
- 协议编解码：backend/src/modules/transcript/doubao.codec.ts:50

---

## 认证配置流程

### 1) 配置环境变量

后端通过 ConfigService 读取以下配置项：

| 配置项 | 说明 | 代码位置 |
| --- | --- | --- |
| `TRANSCRIPT_ENDPOINT` | 豆包 ASR WebSocket 端点 | backend/src/modules/transcript/doubao.client.ts:371 |
| `TRANSCRIPT_APP_KEY` | 应用 App Key | backend/src/modules/transcript/doubao.client.ts:372 |
| `TRANSCRIPT_ACCESS_KEY` | Access Key | backend/src/modules/transcript/doubao.client.ts:373 |
| `TRANSCRIPT_RESOURCE_ID` | 资源 ID（默认 volc.bigasr.sauc.duration） | backend/src/modules/transcript/doubao.client.ts:374 |
| `TRANSCRIPT_MODEL_NAME` | 模型名称（默认 bigmodel） | backend/src/modules/transcript/doubao.client.ts:376 |
| `TRANSCRIPT_ENABLE_ITN` | 是否开启 ITN | backend/src/modules/transcript/doubao.client.ts:377 |
| `TRANSCRIPT_ENABLE_PUNC` | 是否开启标点 | backend/src/modules/transcript/doubao.client.ts:378 |
| `TRANSCRIPT_CONFIG_GZIP` | Config 是否使用 gzip | backend/src/modules/transcript/doubao.client.ts:379 |
| `TRANSCRIPT_AUDIO_GZIP` | Audio 是否使用 gzip | backend/src/modules/transcript/doubao.client.ts:380 |
| `TRANSCRIPT_RESPONSE_TIMEOUT_MS` | 等待响应超时（毫秒） | backend/src/modules/transcript/transcript.service.ts:188 |

### 2) WebSocket 认证头

连接豆包时会在请求头中写入以下字段：

- `X-Api-App-Key`
- `X-Api-Access-Key`
- `X-Api-Resource-Id`
- `X-Api-Connect-Id`

参考实现：backend/src/modules/transcript/doubao.client.ts:168

### 3) 发送 Config 消息

建立连接后需先发送 Config 包（含音频格式与模型参数），否则服务端可能断开连接。Config 负载结构参考：backend/src/modules/transcript/doubao.client.ts:251

---

## 二进制协议详解

### 协议帧结构（ASCII）

```
0                   1                   2                   3
+-------------------+-------------------+-------------------+-------------------+
| Ver(4) | Words(4)  | MsgType(4)|Flag(4)| Ser(4) | Comp(4)  | Reserved(8)      |
+-------------------+-------------------+-------------------+-------------------+
| Seq (int32, BE, optional; Flag=Seq/LastNegSeq)            |
+-------------------+-------------------+-------------------+-------------------+
| PayloadLen (uint32, BE)                                  |
+-------------------+-------------------+-------------------+-------------------+
| Payload (bytes; JSON or PCM; gzip if Comp=Gzip)           |
+-----------------------------------------------------------+
```

字段说明：

- `Ver`：协议版本，当前固定为 1（高 4 bit）。
- `Words`：Header 以 4 字节为单位的长度，当前固定为 1（低 4 bit）。
- `MsgType`：消息类型（Config / Audio / Response / Error）。
- `Flag`：序列号标志，决定是否携带 Seq。
- `Ser`：序列化方式（None / Json）。
- `Comp`：压缩方式（None / Gzip）。
- `Seq`：int32 BE，仅当 Flag 为 `Seq` 或 `LastNegSeq` 时出现。
- `PayloadLen`：payload 长度（uint32 BE）。

编码与解码细节：
- Header 与 Seq、PayloadLen 的编码逻辑：backend/src/modules/transcript/doubao.codec.ts:50
- Gzip 解压与 JSON 反序列化：backend/src/modules/transcript/doubao.codec.ts:123

### 消息类型

| 类型 | 值 | 说明 | 代码位置 |
| --- | --- | --- | --- |
| Config | `0x01` | 配置消息 | backend/src/modules/transcript/doubao.codec.ts:3 |
| Audio | `0x02` | 音频数据 | backend/src/modules/transcript/doubao.codec.ts:3 |
| Response | `0x09` | 识别结果 | backend/src/modules/transcript/doubao.codec.ts:3 |
| Error | `0x0f` | 错误响应 | backend/src/modules/transcript/doubao.codec.ts:3 |

### Flag 与序列号规则

| Flag | 值 | 含义 | 说明 |
| --- | --- | --- | --- |
| `NoSeq` | `0x00` | 无序列号 | 不携带 Seq | 
| `Seq` | `0x01` | 正序列号 | 发送普通音频帧 | 
| `LastNoSeq` | `0x02` | 最后一条无序列号 | 未使用 | 
| `LastNegSeq` | `0x03` | 最后一条负序列号 | 用于结束音频流 | 

实现对应：
- Flag 枚举与序列号规则：backend/src/modules/transcript/doubao.codec.ts:10, backend/src/modules/transcript/doubao.codec.ts:148
- 结束帧使用 `LastNegSeq`，序列号为负数：backend/src/modules/transcript/doubao.client.ts:69

### Payload 约束

- Config payload 使用 JSON，并通常 gzip 压缩：backend/src/modules/transcript/doubao.client.ts:270
- Audio payload 为 PCM 原始字节（Int16，16kHz/单声道），仍使用 `Ser=Json` 标记，压缩由 `TRANSCRIPT_AUDIO_GZIP` 决定：backend/src/modules/transcript/doubao.client.ts:73, backend/src/modules/transcript/doubao.codec.ts:152

---

## 端到端数据流

### 时序概览

```
[Browser AudioCapture]
    | Float32 (Web Audio)
    v
[PCM16 Int16Array]
    | 二进制 WS 帧
    v
[Backend /transcript WS]
    | processBinaryAudio
    v
[DoubaoWsClient]
    | Config + Audio (Doubao Binary)
    v
[Doubao ASR]
    | Response
    v
[Backend]
    | 转写结果
    v
[Frontend]
```

### 关键节点说明

1. 前端采集 Float32 音频并转 PCM16：frontend/src/services/audioCapture.ts:96, frontend/src/services/audioCapture.ts:148
2. 前端通过二进制 WebSocket 发送 PCM 帧：frontend/src/services/websocket.ts:199
3. 后端接收 PCM 并调用 `processBinaryAudio`：backend/src/modules/transcript/transcript.service.ts:84
4. 后端确保 Config 先行并发送 Audio：backend/src/modules/transcript/doubao.client.ts:138
5. 结束流时发送空音频 + `LastNegSeq`：backend/src/modules/transcript/transcript.service.ts:123

---

## 故障排查指南

### 1) WebSocket 1006 / 连接被动断开

可能原因：
- Config 包未发送或无序列号导致服务端断连。
- Config/Audio gzip 设置与服务端不兼容。

排查要点：
- 确认 Config 使用 `Flag=Seq`：backend/src/modules/transcript/doubao.client.ts:269
- 确认 gzip 配置：backend/src/modules/transcript/doubao.client.ts:272

### 2) 长时间无响应

可能原因：
- `TRANSCRIPT_RESPONSE_TIMEOUT_MS` 设置过短。
- 音频包为空或采集失败。

排查要点：
- 检查超时值读取逻辑：backend/src/modules/transcript/transcript.service.ts:188
- 确认音频帧非空：backend/src/modules/transcript/transcript.service.ts:93

### 3) 识别内容为空或断句异常

可能原因：
- PCM 采样率或位深错误。
- 前端未转换成 PCM16。

排查要点：
- 检查采样率配置：frontend/src/services/audioCapture.ts:32
- 检查 PCM16 转换：frontend/src/services/audioCapture.ts:148

### 4) 解码失败 / JSON 解析异常

可能原因：
- Payload 压缩标记与实际不一致。
- 非法二进制包。

排查要点：
- 解压与解析逻辑：backend/src/modules/transcript/doubao.codec.ts:123

---

## 代码示例

### 前端：采集音频并发送二进制帧

```ts
import { audioCapture, AudioCaptureService } from '@/services/audioCapture'
import { websocket } from '@/services/websocket'

const sessionId = `session_${Date.now()}`

await websocket.connect()
websocket.setSession(sessionId)
websocket.startTranscribe()

await audioCapture.startCapture(({ data }) => {
  const pcm16 = AudioCaptureService.floatToPCM16(data)
  websocket.sendAudioData(pcm16)
})

// 停止时通知后端结束转写
const stop = () => {
  audioCapture.stopCapture()
  websocket.stopTranscribe()
}
```

相关实现：frontend/src/services/audioCapture.ts:61, frontend/src/services/audioCapture.ts:148, frontend/src/services/websocket.ts:199

### 后端：处理二进制音频帧并获取转写结果

```ts
const result = await transcriptService.processBinaryAudio(
  clientId,
  audioBuffer,
  sessionId
)

if (result?.isFinal) {
  // 结束流并释放客户端
  await transcriptService.finalizeAudio(clientId, sessionId)
}
```

相关实现：backend/src/modules/transcript/transcript.service.ts:84, backend/src/modules/transcript/transcript.service.ts:123
