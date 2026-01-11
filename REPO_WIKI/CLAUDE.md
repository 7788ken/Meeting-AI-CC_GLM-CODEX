# Meeting-AI 架构索引

> 最后更新: 2026-01-11
> 维护者: Claude Code (repo-wiki skill)

## 架构概览

- 前端：Web Audio 采集 + 原生 WebSocket 推流（frontend/）。
- 后端：NestJS Transcript 模块负责与豆包 ASR 建连与协议编解码（backend/）。
- 外部依赖：豆包语音识别 WebSocket 服务。

## 关键数据流

```
[Frontend AudioCapture] -> [Frontend WebSocket] -> [Backend /transcript WS] -> [Doubao ASR]
                               ^                                     |
                               |                                     v
                         Transcript Result <--------------------------
```

## 核心代码入口

- 豆包连接与认证头：backend/src/modules/transcript/doubao.client.ts:168
- Config/Audio 包发送：backend/src/modules/transcript/doubao.client.ts:54
- 二进制协议编解码：backend/src/modules/transcript/doubao.codec.ts:50
- 二进制音频处理：backend/src/modules/transcript/transcript.service.ts:84
- 前端 PCM 转换：frontend/src/services/audioCapture.ts:148
- 前端二进制发送：frontend/src/services/websocket.ts:199

## 文档索引

- Transcript 模块说明：REPO_WIKI/modules/transcript.md
- 豆包语音流识别 2.0 使用文档：docs/doubao-asr-2.0-guide.md
- 转写调试记录：docs/transcription-debug.md
