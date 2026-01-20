# Docker 部署指南

<cite>
**本文档引用的文件**
- [docker-compose.yml](file://docker-compose.yml)
- [backend/Dockerfile](file://backend/Dockerfile)
- [frontend/Dockerfile](file://frontend/Dockerfile)
- [frontend/nginx.conf](file://frontend/nginx.conf)
</cite>

## 目录
1. [概述](#概述)
2. [服务与端口](#服务与端口)
3. [启动方式](#启动方式)
4. [构建镜像说明](#构建镜像说明)
5. [Nginx 代理](#nginx-代理)

## 概述
Docker Compose 支持 dev/prod 两种 profile：dev 仅启动数据库，prod 启动全部服务（或直接 `docker compose up`）。

**Section sources**
- [docker-compose.yml](file://docker-compose.yml#L1-L12)

## 服务与端口
- PostgreSQL：`5432:5432`，包含初始化 SQL 与数据卷。
- MongoDB：`27017:27017`，数据卷持久化。
- Backend：`5181:5181`，依赖 PostgreSQL/Mongo，默认 API 前缀 `api`。
- Frontend：`80:80`，依赖 Backend。

**Section sources**
- [docker-compose.yml](file://docker-compose.yml#L14-L96)

## 启动方式
- 仅数据库（dev）：`docker compose --profile dev up`
- 全量服务（prod）：`docker compose --profile prod up` 或 `docker compose up`
- 停止并清理：`docker compose down`（需要清理卷可加 `-v`）

**Section sources**
- [docker-compose.yml](file://docker-compose.yml#L1-L12)

## 构建镜像说明
- 后端镜像：Node 20 构建产物，安装依赖后生成 Prisma Client 并编译，再复制到运行镜像。
- 前端镜像：Node 20 构建产物，使用 Nginx 提供静态文件服务。

**Section sources**
- [backend/Dockerfile](file://backend/Dockerfile#L1-L41)
- [frontend/Dockerfile](file://frontend/Dockerfile#L1-L29)

## Nginx 代理
- `/api` 代理至 `backend:5181/api`。
- `/transcript` 代理至 `backend:5181/transcript`（WebSocket）。

**Section sources**
- [frontend/nginx.conf](file://frontend/nginx.conf#L1-L36)
