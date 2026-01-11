# Meeting-AI Monorepo

AI会议助手 - 轻量级Web智能应用，提供实时语音转写和AI分析功能。

## 项目结构

```
team2/
├── frontend/          # Vue 3 + Vite + TypeScript
├── backend/           # NestJS + Prisma + PostgreSQL + MongoDB
├── Readme/           # 项目文档
├── pnpm-workspace.yaml
└── package.json
```

## 快速开始

### 安装依赖
```bash
pnpm install
```

### 启动开发服务器
```bash
# 前端开发服务器
pnpm dev:frontend

# 后端开发服务器
pnpm dev:backend
```

### 构建
```bash
# 构建前端
pnpm build:frontend

# 构建后端
pnpm build:backend
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

详细文档请查看 [Readme/](./Readme/) 目录。

Codex 审阅文档请查看 [`codex 审阅文档.md`](./codex%20%E5%AE%A1%E9%98%85%E6%96%87%E6%A1%A3.md)。

MVP 任务清单请查看 [`MVP任务清单.md`](./MVP%E4%BB%BB%E5%8A%A1%E6%B8%85%E5%8D%95.md)。
