# Meeting-AI Monorepo

AI会议助手 - 面向会议场景的轻量级 Web 智能应用，提供实时语音转写、语句拆分与 AI 分析能力，帮助用户快速沉淀关键信息与结论。

## 快速链接

- 文档入口（Wiki）：[`docs/wiki/home.md`](./docs/wiki/home.md)
- Docker 部署：[`docs/wiki/deployment/docker.md`](./docs/wiki/deployment/docker.md)
- 后端架构：[`docs/wiki/backend/architecture.md`](./docs/wiki/backend/architecture.md)
- 后端 API：`http://localhost:5181/api/docs`（开发环境默认）

## 项目简介

Meeting-AI 将实时音频转写、语句拆分、翻译与分析打通到统一流程，支持前后端分离部署与可观测的队列/性能指标，适用于团队会议、面试复盘等高频场景。

## 核心能力

- 实时语音转写与流式展示
- 语句拆分、翻译与结果持久化
- AI 会议分析/总结与针对性分析
- 可配置的限流与队列统计

## 提示词模板

提示词分为两类：总结、分段。当前覆盖情况如下：

| 场景 | 总结 | 分段 |
| --- | --- | --- |
| 会议 | 已支持 | 已支持 |
| 面试 | 已支持 | 已支持 |
| 上课 | 已支持 | 已支持 |
| 谈判 | 已支持 | 已支持 |

## 项目结构

```file
team2/
├── frontend/            # Vue 3 + Vite + TypeScript
├── backend/             # NestJS + Prisma + PostgreSQL + MongoDB
├── docs/wiki/           # 项目 Wiki（架构/API/部署/前端文档）
├── docker-compose.yml   # 本地/生产 Compose（dev/prod profiles）
├── start.sh             # 一键启动开发环境（可选）
├── stop.sh              # 一键停止开发环境（可选）
├── pnpm-workspace.yaml  # Monorepo 配置
└── package.json         # 根脚本入口
```

## 快速开始

### 环境要求

- Node.js 20（CI 与 Docker 构建默认使用 Node 20）
- pnpm 8（仓库根 `package.json#packageManager` 指定版本）
- 本地开发建议使用 Docker 启动 PostgreSQL + MongoDB（或自行安装同版本数据库）

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

本仓库将环境变量样例提交为 `*.env.example`，实际运行请复制为 `*.env`：

```bash
cp "backend/.env.example" "backend/.env"
cp "frontend/.env.example" "frontend/.env"
```

### 启动依赖的数据库（推荐）

```bash
docker compose --profile dev up -d
```

### 启动开发服务器

```bash
# 前端开发服务器
pnpm dev:frontend

# 后端开发服务器
pnpm dev:backend
```

### 可选：一键启动/停止（开发环境）

仓库根目录提供脚本用于一键启动/关闭（会进行依赖检查，并尝试启动 Docker/Colima）：

```bash
./start.sh
./stop.sh
```

### 访问入口（默认）

- Frontend：`http://localhost:5173`
- Backend：`http://localhost:5181/api`
- Swagger：`http://localhost:5181/api/docs`
- WebSocket（转写）：`ws://localhost:5181/transcript`

### 构建

```bash
# 构建前端
pnpm build:frontend

# 构建后端
pnpm build:backend
```

### 代码质量与测试（CI 同步）

```bash
pnpm lint:frontend
pnpm lint:backend
pnpm --dir frontend test
pnpm --dir backend test
```

## 技术栈

### 前端

- Vue 3.4.x - 响应式框架
- TypeScript 5.x - 类型安全
- Vite 5.x - 构建工具
- Element Plus 2.5.x - UI组件库
- Pinia 2.1.x - 状态管理
- Vue Router 4.x - 路由管理
- Axios - HTTP客户端

### 后端

- NestJS 10.x - Node.js框架
- Prisma - ORM
- PostgreSQL - 关系型数据库
- MongoDB - 文档数据库
- WebSocket - 实时通信
- Swagger - API文档

## 文档

- 项目 Wiki（推荐作为主要文档入口）：[`docs/wiki/home.md`](./docs/wiki/home.md)
- Docker 部署：[`docs/wiki/deployment/docker.md`](./docs/wiki/deployment/docker.md)
- Codex 审阅规范：[`docs/codex 审阅文档.md`](./docs/codex%20%E5%AE%A1%E9%98%85%E6%96%87%E6%A1%A3.md)
- 需求/实现梳理：[`docs/语句拆分需求梳理.md`](./docs/%E8%AF%AD%E5%8F%A5%E6%8B%86%E5%88%86%E9%9C%80%E6%B1%82%E6%A2%B3%E7%90%86.md)
- 并发与限流方案：[`docs/并发解决方案.md`](./docs/%E5%B9%B6%E5%8F%91%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88.md)
- Roadmap / 待办：[`docs/待处理任务.md`](./docs/%E5%BE%85%E5%A4%84%E7%90%86%E4%BB%BB%E5%8A%A1.md)

## Docker 部署

优先参考：[`docs/wiki/deployment/docker.md`](./docs/wiki/deployment/docker.md)（包含 dev/prod profiles、端口与 Nginx 代理说明）。

## GitHub 仓库 About（Edit repository details）建议

用于补全 GitHub 仓库首页右侧 About 信息（点击齿轮“Edit repository details”）：

- Description：一句话说明“是什么 + 做什么 + 关键特性/场景”。
  - CN：`AI 会议助手：实时语音转写 + 语句拆分/翻译 + AI 分析的轻量级 Web 应用（Vue 3 + NestJS）。`
  - EN：`Meeting AI assistant: real-time transcription, segmentation/translation, and AI insights (Vue 3 + NestJS).`
- Website：项目官网 / 在线 Demo / 文档站入口（没有可留空；或临时填 README 链接）。
- Topics：用于检索与分类（建议 8–15 个，覆盖领域 + 技术栈 + 形态）。
  - 推荐：`meeting-ai, speech-to-text, asr, transcription, realtime, websocket, llm, ai-assistant, nestjs, vue, vite, typescript, prisma, postgresql, mongodb, monorepo, pnpm`
- Social preview：社交分享卡片图（建议 1280×640，包含项目名 + 1 行价值主张 + 2–3 个卖点）。
- 展示开关（Releases/Packages/Environments）：仅在实际启用且对外可用时再打开，避免噪音。

## 参与与合规

- 贡献指南：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 行为准则：[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- 安全策略：[SECURITY.md](./SECURITY.md)
- 许可证：[LICENSE](./LICENSE)
