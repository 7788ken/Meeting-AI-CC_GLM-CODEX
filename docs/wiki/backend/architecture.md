# 后端架构

<cite>
**本文档引用的文件**
- [backend/package.json](file://backend/package.json)
- [backend/src/app.module.ts](file://backend/src/app.module.ts)
- [backend/src/main.ts](file://backend/src/main.ts)
- [backend/prisma/schema.prisma](file://backend/prisma/schema.prisma)
- [backend/src/modules/speech/schemas/speech.schema.ts](file://backend/src/modules/speech/schemas/speech.schema.ts)
- [backend/src/modules/transcript-stream/schemas/transcript-event.schema.ts](file://backend/src/modules/transcript-stream/schemas/transcript-event.schema.ts)
- [backend/src/modules/transcript-stream/schemas/transcript-state.schema.ts](file://backend/src/modules/transcript-stream/schemas/transcript-state.schema.ts)
- [backend/src/modules/transcript-event-segmentation/schemas/transcript-event-segment.schema.ts](file://backend/src/modules/transcript-event-segmentation/schemas/transcript-event-segment.schema.ts)
- [backend/src/modules/transcript-analysis/schemas/transcript-analysis-summary.schema.ts](file://backend/src/modules/transcript-analysis/schemas/transcript-analysis-summary.schema.ts)
- [backend/src/modules/transcript-analysis/schemas/transcript-analysis-segment.schema.ts](file://backend/src/modules/transcript-analysis/schemas/transcript-analysis-segment.schema.ts)
</cite>

## 目录
1. [概览](#概览)
2. [模块划分](#模块划分)
3. [启动与横切能力](#启动与横切能力)
4. [数据存储](#数据存储)
5. [实时转写与事件流](#实时转写与事件流)
6. [语句拆分与分析](#语句拆分与分析)
7. [观测与配置模块](#观测与配置模块)

## 概览
后端基于 NestJS，核心依赖包括 Prisma、Mongoose、JWT 与 WebSocket，采用多模块拆分的业务结构，覆盖会话、发言、原文事件流、语句拆分与 AI 分析等能力。

**Section sources**
- [backend/package.json](file://backend/package.json#L1-L46)
- [backend/src/app.module.ts](file://backend/src/app.module.ts#L1-L70)

## 模块划分
应用根模块汇聚了会话、发言、转写、拆分、分析、配置、日志、运维等模块，形成业务与基础能力分层：
- 业务主线：Session、Speech、Transcript、TranscriptStream、TranscriptEventSegmentation、TranscriptAnalysis。
- 基础服务：Auth、AppConfig、PromptLibrary、Ops、AppLog、DebugError。

**Section sources**
- [backend/src/app.module.ts](file://backend/src/app.module.ts#L1-L50)

## 启动与横切能力
- 通过全局配置加载与验证管道控制输入校验，统一设置 CORS 与 API 前缀。
- Swagger 文档在 `/api/docs` 暴露；WebSocket 服务监听 `/transcript` 路径。
- 全局异常过滤、日志拦截与 JWT Guard 统一接入。

**Section sources**
- [backend/src/main.ts](file://backend/src/main.ts#L53-L130)
- [backend/src/app.module.ts](file://backend/src/app.module.ts#L52-L67)

## 数据存储
- PostgreSQL（Prisma）：存储会话、后端配置与应用日志。
- MongoDB（Mongoose）：存储发言记录、原文事件流、拆分结果与分析产出。

**Section sources**
- [backend/prisma/schema.prisma](file://backend/prisma/schema.prisma#L1-L61)
- [backend/src/modules/speech/schemas/speech.schema.ts](file://backend/src/modules/speech/schemas/speech.schema.ts#L1-L56)
- [backend/src/modules/transcript-stream/schemas/transcript-event.schema.ts](file://backend/src/modules/transcript-stream/schemas/transcript-event.schema.ts#L1-L42)
- [backend/src/modules/transcript-stream/schemas/transcript-state.schema.ts](file://backend/src/modules/transcript-stream/schemas/transcript-state.schema.ts#L1-L29)
- [backend/src/modules/transcript-event-segmentation/schemas/transcript-event-segment.schema.ts](file://backend/src/modules/transcript-event-segmentation/schemas/transcript-event-segment.schema.ts#L1-L90)
- [backend/src/modules/transcript-analysis/schemas/transcript-analysis-summary.schema.ts](file://backend/src/modules/transcript-analysis/schemas/transcript-analysis-summary.schema.ts#L1-L33)
- [backend/src/modules/transcript-analysis/schemas/transcript-analysis-segment.schema.ts](file://backend/src/modules/transcript-analysis/schemas/transcript-analysis-segment.schema.ts#L1-L43)

## 实时转写与事件流
- 服务端使用原生 WebSocket `/transcript` 接收音频并输出转写事件。
- 原文事件流以 `transcript_events` 落库，`transcript_state` 维护会话级事件索引与版本号。

**Section sources**
- [backend/src/main.ts](file://backend/src/main.ts#L108-L130)
- [backend/src/modules/transcript-stream/schemas/transcript-event.schema.ts](file://backend/src/modules/transcript-stream/schemas/transcript-event.schema.ts#L1-L42)
- [backend/src/modules/transcript-stream/schemas/transcript-state.schema.ts](file://backend/src/modules/transcript-stream/schemas/transcript-state.schema.ts#L1-L29)

## 语句拆分与分析
- 语句拆分结果存储于 `transcript_events_segments`，记录事件范围、序号与翻译字段。
- 会话总结与语句分析以 Markdown 形式存储，分别落在 `transcript_analysis_summaries` 与 `transcript_analysis_segment_analyses`。

**Section sources**
- [backend/src/modules/transcript-event-segmentation/schemas/transcript-event-segment.schema.ts](file://backend/src/modules/transcript-event-segmentation/schemas/transcript-event-segment.schema.ts#L1-L90)
- [backend/src/modules/transcript-analysis/schemas/transcript-analysis-summary.schema.ts](file://backend/src/modules/transcript-analysis/schemas/transcript-analysis-summary.schema.ts#L1-L33)
- [backend/src/modules/transcript-analysis/schemas/transcript-analysis-segment.schema.ts](file://backend/src/modules/transcript-analysis/schemas/transcript-analysis-segment.schema.ts#L1-L43)

## 观测与配置模块
- AppConfig/PromptLibrary 负责模型与提示词配置。
- Ops 模块提供运行中控数据流；AppLog/DebugError 支撑调试台观测。

**Section sources**
- [backend/src/app.module.ts](file://backend/src/app.module.ts#L15-L50)
