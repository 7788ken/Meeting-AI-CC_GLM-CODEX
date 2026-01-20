# 前端架构

<cite>
**本文档引用的文件**
- [frontend/package.json](file://frontend/package.json)
- [frontend/src/main.ts](file://frontend/src/main.ts)
- [frontend/src/router/index.ts](file://frontend/src/router/index.ts)
- [frontend/src/services/api.ts](file://frontend/src/services/api.ts)
- [frontend/src/services/websocket.ts](file://frontend/src/services/websocket.ts)
- [frontend/src/stores/transcriptStream.ts](file://frontend/src/stores/transcriptStream.ts)
- [frontend/src/stores/transcriptEventSegmentation.ts](file://frontend/src/stores/transcriptEventSegmentation.ts)
- [frontend/src/views/ConcurrencySimulatorView.vue](file://frontend/src/views/ConcurrencySimulatorView.vue)
</cite>

## 目录
1. [技术栈](#技术栈)
2. [入口与全局插件](#入口与全局插件)
3. [路由结构](#路由结构)
4. [状态管理与实时数据](#状态管理与实时数据)
5. [服务层与后端交互](#服务层与后端交互)
6. [运行中控大屏数据源](#运行中控大屏数据源)

## 技术栈
前端基于 Vue 3 + Vite，使用 Pinia 管理状态、Vue Router 管理路由，Element Plus 作为 UI 组件库，并通过 Axios 与后端交互。

**Section sources**
- [frontend/package.json](file://frontend/package.json#L1-L25)

## 入口与全局插件
入口文件完成应用初始化，并注册 Pinia、Router 与 Element Plus，同时加载全局样式。

**Section sources**
- [frontend/src/main.ts](file://frontend/src/main.ts#L1-L16)

## 路由结构
前端路由覆盖首页、会议创建/详情与运行中控大屏入口：
- `/`：HomeView
- `/meeting/new` 与 `/meeting/:id`：MeetingView
- `/ops/concurrency-dashboard`：ConcurrencySimulatorView

**Section sources**
- [frontend/src/router/index.ts](file://frontend/src/router/index.ts#L1-L29)

## 状态管理与实时数据
- `transcriptStream` store 维护原文事件流的 revision/index，支持快照加载与 WebSocket 增量更新。
- `transcriptEventSegmentation` store 管理语句拆分结果与拆分进度，支持快照恢复与实时推送更新。

**Section sources**
- [frontend/src/stores/transcriptStream.ts](file://frontend/src/stores/transcriptStream.ts#L1-L162)
- [frontend/src/stores/transcriptEventSegmentation.ts](file://frontend/src/stores/transcriptEventSegmentation.ts#L1-L140)

## 服务层与后端交互
- REST API 通过 `services/api.ts` 统一封装，覆盖会话、发言、拆分、分析、配置与日志能力。
- WebSocket 服务负责 `/transcript` 通道连接与消息分发，定义转写事件、拆分事件与进度消息类型。

**Section sources**
- [frontend/src/services/api.ts](file://frontend/src/services/api.ts#L1-L492)
- [frontend/src/services/websocket.ts](file://frontend/src/services/websocket.ts#L1-L200)

## 运行中控大屏数据源
运行中控大屏通过 EventSource 连接 `/ops/stream`，消费队列、任务日志与会话运行态数据。

**Section sources**
- [frontend/src/views/ConcurrencySimulatorView.vue](file://frontend/src/views/ConcurrencySimulatorView.vue#L670-L889)
