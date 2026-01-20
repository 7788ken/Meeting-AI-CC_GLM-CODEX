# AI 会议助手 Wiki

<cite>
**本文档引用的文件**
- [README.md](file://README.md)
- [package.json](file://package.json)
- [frontend/package.json](file://frontend/package.json)
- [backend/package.json](file://backend/package.json)
- [frontend/src/main.ts](file://frontend/src/main.ts)
- [frontend/src/router/index.ts](file://frontend/src/router/index.ts)
- [backend/src/app.module.ts](file://backend/src/app.module.ts)
- [backend/src/main.ts](file://backend/src/main.ts)
- [backend/prisma/schema.prisma](file://backend/prisma/schema.prisma)
- [docs/wiki/backend/architecture.md](file://docs/wiki/backend/architecture.md)
- [docs/wiki/backend/api.md](file://docs/wiki/backend/api.md)
- [docs/wiki/frontend/architecture.md](file://docs/wiki/frontend/architecture.md)
- [docs/wiki/frontend/components.md](file://docs/wiki/frontend/components.md)
- [docs/wiki/frontend/concurrency-dashboard.md](file://docs/wiki/frontend/concurrency-dashboard.md)
- [docs/wiki/deployment/docker.md](file://docs/wiki/deployment/docker.md)
</cite>

## 目录
1. [项目概览](#项目概览)
2. [技术架构速览](#技术架构速览)
3. [开发脚本与快速启动](#开发脚本与快速启动)
4. [文档导航](#文档导航)

## 项目概览
Meeting-AI 是面向会议场景的 Web 智能应用，覆盖实时语音转写、语句拆分/翻译与 AI 分析，并支持队列与性能指标的可观测能力。

**Section sources**
- [README.md](file://README.md#L1-L15)

## 技术架构速览
- 前端采用 Vue 3 + Vite + Pinia + Element Plus，入口在 `main.ts`，路由包含首页、会议页与运行中控大屏入口。
- 后端基于 NestJS，模块覆盖会话、发言、原文事件流、语句拆分、AI 分析、配置与运维流。
- 数据层以 PostgreSQL（Prisma）承载会话与配置数据，MongoDB 承载原文事件流、语句拆分与分析结果。
- 服务统一前缀默认 `/api`，并提供 `/api/docs` Swagger 文档与 `/transcript` WebSocket 转写入口。

**Section sources**
- [frontend/package.json](file://frontend/package.json#L1-L45)
- [frontend/src/main.ts](file://frontend/src/main.ts#L1-L16)
- [frontend/src/router/index.ts](file://frontend/src/router/index.ts#L1-L29)
- [backend/package.json](file://backend/package.json#L1-L46)
- [backend/src/app.module.ts](file://backend/src/app.module.ts#L1-L70)
- [backend/src/main.ts](file://backend/src/main.ts#L68-L130)
- [backend/prisma/schema.prisma](file://backend/prisma/schema.prisma#L1-L61)

## 开发脚本与快速启动
- 安装依赖：`pnpm install`
- 启动前端：`pnpm dev:frontend`
- 启动后端：`pnpm dev:backend`
- 构建前端：`pnpm build:frontend`
- 构建后端：`pnpm build:backend`

**Section sources**
- [package.json](file://package.json#L1-L15)
- [README.md](file://README.md#L38-L64)

## 文档导航
- 后端架构：`docs/wiki/backend/architecture.md`
- 后端 API：`docs/wiki/backend/api.md`
- 前端架构：`docs/wiki/frontend/architecture.md`
- 前端组件：`docs/wiki/frontend/components.md`
- 运行中控大屏：`docs/wiki/frontend/concurrency-dashboard.md`
- Docker 部署：`docs/wiki/deployment/docker.md`

**Section sources**
- [docs/wiki/backend/architecture.md](file://docs/wiki/backend/architecture.md)
- [docs/wiki/backend/api.md](file://docs/wiki/backend/api.md)
- [docs/wiki/frontend/architecture.md](file://docs/wiki/frontend/architecture.md)
- [docs/wiki/frontend/components.md](file://docs/wiki/frontend/components.md)
- [docs/wiki/frontend/concurrency-dashboard.md](file://docs/wiki/frontend/concurrency-dashboard.md)
- [docs/wiki/deployment/docker.md](file://docs/wiki/deployment/docker.md)
