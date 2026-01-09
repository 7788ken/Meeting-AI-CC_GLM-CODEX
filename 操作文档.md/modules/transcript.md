# Transcript 模块 - 豆包流式语音识别

## 概述

Transcript 模块实现了基于豆包（Doubao）Speech Recognition API 的流式语音转写功能。该模块通过 WebSocket 协议与豆包服务通信，支持实时语音识别和结果返回。

## 技术栈

- **NestJS** - 后端框架
- **WebSocket (ws)** - 与豆包服务的通信协议
- **Socket.IO** - 与前端的实时通信
- **TypeScript** - 类型安全

## 模块结构

```
backend/src/modules/transcript/
├── transcript.module.ts      # 模块定义
├── transcript.gateway.ts     # Socket.IO 网关
├── transcript.service.ts     # 核心业务逻辑
├── doubao.client.ts          # 豆包 WebSocket 客户端
├── doubao.codec.ts           # 二进制协议编解码器
├── dto/
│   └── transcript.dto.ts     # 数据传输对象
└── *.spec.ts                 # 单元测试文件
```

## 核心组件

### 1. DoubaoBinaryCodec (doubao.codec.ts)

二进制协议编解码器，负责编码请求和解码响应。

**协议格式：**
```
┌─────────┬─────────┬─────────┬─────────┬──────────┬──────────┐
│ Version │ MsgType│ Ser/Comp│ Reserved│ Seq Len  │ Payload  │
│ (4bit)  │ (4bit) │ (8bit)  │ (8bit)  │ (optional)│          │
└─────────┴─────────┴─────────┴─────────┴──────────┴──────────┘
```

**消息类型：**
| 类型 | 值 | 说明 |
|-----|-----|-----|
| Config | 0x01 | 配置消息 |
| Audio | 0x02 | 音频数据 |
| Response | 0x09 | 识别结果 |
| Error | 0x0f | 错误响应 |

**标志位：**
| 标志 | 值 | 说明 |
|-----|-----|-----|
| NoSeq | 0x00 | 无序列号 |
| Seq | 0x01 | 带序列号 |
| LastNoSeq | 0x02 | 最后一条（无序列号） |
| LastNegSeq | 0x03 | 最后一条（负序列号） |

### 2. DoubaoClientManager (doubao.client.ts)

管理多个豆包 WebSocket 客户端实例的生命周期。

**核心功能：**
- 创建和管理 DoubaoWsClient 实例
- 按 clientId 隔离不同客户端的连接
- 自动从配置服务读取认证信息

**关键方法：**
```typescript
// 获取或创建客户端
getOrCreate(clientId: string, userId: string): DoubaoWsClient

// 获取现有客户端
get(clientId: string): DoubaoWsClient | undefined

// 关闭并移除客户端
close(clientId: string): Promise<void>
```

### 3. DoubaoWsClient (doubao.client.ts - 内部类)

与豆包 WebSocket 服务通信的核心客户端。

**工作流程：**
1. 建立 WebSocket 连接（带认证头）
2. 发送配置消息（音频格式、模型参数）
3. 流式发送音频数据
4. 接收识别结果

**认证头：**
```
X-Api-App-Key: [应用密钥]
X-Api-Access-Key: [访问密钥]
X-Api-Resource-Id: [资源ID]
X-Api-Connect-Id: [UUID连接ID]
```

**配置消息格式：**
```json
{
  "user": { "uid": "用户ID" },
  "audio": {
    "format": "pcm",
    "rate": 16000,
    "bits": 16,
    "channel": 1
  },
  "request": {
    "model_name": "bigmodel",
    "enable_itn": true,
    "enable_punc": true
  }
}
```

### 4. TranscriptService (transcript.service.ts)

业务逻辑层，协调音频处理和转写结果返回。

**核心方法：**
```typescript
// 处理音频数据
processAudio(
  clientId: string,
  audioData: string,    // base64 编码的音频
  sessionId: string,
  isFinal: boolean
): Promise<TranscriptResultDto | null>

// 结束音频流
endAudio(clientId: string): Promise<void>
```

**转写结果格式：**
```typescript
interface TranscriptResultDto {
  id: string           // 唯一标识
  sessionId: string    // 会话ID
  speakerId: string    // 说话人ID
  speakerName: string  // 说话人名称
  content: string      // 转写文本
  isFinal: boolean     // 是否最终结果
  confidence: number   // 置信度 0-1
}
```

### 5. TranscriptGateway (transcript.gateway.ts)

Socket.IO 网关，处理前端 WebSocket 连接。

**命名空间：** `/ws`

**支持的事件：**

| 客户端发送 | 服务端响应 | 说明 |
|-----------|-----------|------|
| `session:start` | `session:started` | 开始会话 |
| `session:end` | `session:ended` | 结束会话 |
| `audio:start` | `audio:started` | 开始音频流 |
| `audio:data` | `transcript:result` | 发送音频数据 |
| `audio:end` | `audio:ended` | 结束音频流 |

## 环境配置

在 `backend/.env` 文件中配置：

```bash
# 豆包语音识别服务端点
TRANSCRIPT_ENDPOINT=wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async

# 应用认证信息
TRANSCRIPT_APP_KEY=your_app_key
TRANSCRIPT_ACCESS_KEY=your_access_key

# 资源ID（可选，默认 volc.seedasr.sauc.concurrent）
TRANSCRIPT_RESOURCE_ID=volc.seedasr.sauc.duration

# 响应超时时间（毫秒，默认 5000）
TRANSCRIPT_RESPONSE_TIMEOUT_MS=5000
```

## 测试

### 测试文件

| 文件 | 测试内容 | 覆盖率 |
|-----|---------|-------|
| doubao.codec.spec.ts | 二进制协议编解码 | 93.82% |
| doubao.client.spec.ts | 客户端管理器 | 84.62% |
| transcript.service.spec.ts | 业务逻辑 | 94.87% |
| transcript.gateway.spec.ts | Socket.IO 网关 | 100% |
| transcript.e2e-spec.ts | E2E 集成测试 | - |

### 运行测试

```bash
# 运行单元测试
cd backend && npm test

# 运行 E2E 测试
cd backend && npm run test:e2e

# 生成覆盖率报告
cd backend && npm run test:cov
```

### 测试结果

- **单元测试：** 78 个测试通过
- **E2E 测试：** 10 个测试通过
- **总覆盖率：** 72.88% statements
  - Gateway: 100%
  - Service: 94.87%
  - Codec: 93.82%
  - Client Manager: 84.62%

## 前端集成示例

```typescript
import { io } from 'socket.io-client'

const socket = io('ws://localhost:3000/ws')

// 开始会话
socket.emit('session:start', { sessionId: 'meeting-123' })

// 开始音频流
socket.emit('audio:start')

// 发送音频数据（base64 编码的 PCM）
socket.emit('audio:data', {
  audioData: 'base64_encoded_pcm_data',
  sessionId: 'meeting-123',
  isFinal: false
})

// 接收转写结果
socket.on('transcript:result', (result) => {
  console.log(result.content) // 转写文本
})

// 结束音频流
socket.emit('audio:end')
```

## 故障排查

### 连接问题

1. **认证失败：** 检查 `TRANSCRIPT_APP_KEY` 和 `TRANSCRIPT_ACCESS_KEY`
2. **端口被占用：** 检查防火墙和 WebSocket 端口配置
3. **SSL 证书问题：** 确保使用 `wss://` 协议

### 音频问题

1. **无转写结果：** 确认音频格式为 PCM 16kHz 单声道
2. **延迟过高：** 调整 `TRANSCRIPT_RESPONSE_TIMEOUT_MS`
3. **识别错误：** 检查音频质量和编码方式

### 测试问题

1. **端口权限错误 (EPERM)：** E2E 测试已配置为不监听端口
2. **依赖安装失败：** 使用 `--registry=https://registry.npmmirror.com`

## 版本历史

| 版本 | 日期 | 变更 |
|-----|------|-----|
| 1.0.0 | 2025-01-09 | 初始实现，完整的豆包语音识别集成 |
