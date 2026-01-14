# Docker 部署指南

## 概述

本项目使用 Docker 和 Docker Compose 进行容器化部署，支持一键启动所有服务。

## 服务架构

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx (可选)                          │
│                   反向代理 / 负载均衡                     │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────┐               ┌───────────────┐
│   Frontend    │               │    Backend    │
│   (Vue SPA)   │◄─────────────►│   (NestJS)    │
│   Port: 8080  │   HTTP/WS     │   Port: 5181  │
└───────────────┘               └───────┬───────┘
                                         │
        ┌────────────────────────────────┴────────┐
        ▼                                         ▼
┌───────────────┐                       ┌───────────────┐
│  PostgreSQL   │                       │    MongoDB    │
│  Port: 5432   │                       │  Port: 27017  │
│  (会话数据)    │                       │  (发言记录)    │
└───────────────┘                       └───────────────┘
```

## 快速开始

### 前置要求

- Docker >= 24.0
- Docker Compose >= 2.20
- pnpm >= 8 (本地开发)

### 一键启动

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

访问：
- 前端: http://localhost:8080
- 后端 API: http://localhost:5181
- API 文档: http://localhost:5181/api/docs

## 配置说明

### docker-compose.yml

```yaml
version: '3.8'

services:
  # PostgreSQL 数据库
  postgres:
    image: postgres:16-alpine
    container_name: meeting-ai-postgres
    environment:
      POSTGRES_USER: meeting_user
      POSTGRES_PASSWORD: meeting_pass
      POSTGRES_DB: meeting_ai
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U meeting_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  # MongoDB 数据库
  mongodb:
    image: mongo:8
    container_name: meeting-ai-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: meeting_user
      MONGO_INITDB_ROOT_PASSWORD: meeting_pass
      MONGO_INITDB_DATABASE: meeting_ai
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  # 后端服务
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: meeting-ai-backend
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://meeting_user:meeting_pass@postgres:5432/meeting_ai
      MONGODB_URI: mongodb://meeting_user:meeting_pass@mongodb:27017/meeting_ai?authSource=admin
      PORT: 5181
    ports:
      - "5181:5181"
    depends_on:
      postgres:
        condition: service_healthy
      mongodb:
        condition: service_healthy
    volumes:
      - ./backend:/app
      - /app/node_modules
      - /app/dist

  # 前端服务
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: meeting-ai-frontend
    environment:
      VITE_API_BASE_URL: http://localhost:5181/api
      VITE_WS_URL: ws://localhost:5181/transcript
    ports:
      - "8080:80"
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  postgres_data:
  mongodb_data:
```

## Dockerfile

### 后端 Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 构建项目
RUN pnpm run build

# 生产镜像
FROM node:20-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖和构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 5181

CMD ["pnpm", "run", "start:prod"]
```

### 前端 Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建项目
RUN pnpm run build

# 生产镜像 (使用 nginx)
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Nginx 配置

```nginx
# frontend/nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理 (可选)
    location /api/ {
        proxy_pass http://backend:5181/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 代理 (可选)
    location /ws/ {
        proxy_pass http://backend:5181/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 常用命令

### 服务管理

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 重启服务
docker-compose restart

# 重新构建并启动
docker-compose up -d --build

# 删除所有数据（危险！）
docker-compose down -v
```

### 日志查看

```bash
# 查看所有日志
docker-compose logs

# 查看特定服务日志
docker-compose logs backend
docker-compose logs frontend

# 实时跟踪日志
docker-compose logs -f backend
```

### 进入容器

```bash
# 进入后端容器
docker-compose exec backend sh

# 进入前端容器
docker-compose exec frontend sh

# 进入数据库
docker-compose exec postgres psql -U meeting_user meeting_ai
docker-compose exec mongodb mongosh -u meeting_user -p meeting_pass
```

## 环境变量

### 后端环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `production` | 运行环境 |
| `PORT` | `5181` | 服务端口 |
| `DATABASE_URL` | - | PostgreSQL 连接字符串 |
| `MONGODB_URI` | - | MongoDB 连接字符串 |
| `GLM_API_KEY` | - | GLM API 密钥 |

### 前端环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_BASE_URL` | `/api` | API 基础路径 |
| `VITE_WS_URL` | `ws://localhost:5181/transcript` | WebSocket 地址 |

## 生产部署建议

### 1. 使用环境文件

```bash
# .env.production
DATABASE_URL=postgresql://user:pass@prod-db:5432/meeting_ai
MONGODB_URI=mongodb://user:pass@prod-mongo:27017/meeting_ai
GLM_API_KEY=your_api_key
```

### 2. 配置反向代理

使用 Nginx 或 Traefik 作为反向代理：

```nginx
upstream backend {
    server backend:5181;
}

upstream frontend {
    server frontend:80;
}

server {
    listen 80;
    server_name meeting.example.com;

    location / {
        proxy_pass http://frontend;
    }

    location /api/ {
        proxy_pass http://backend/api/;
    }

    location /ws/ {
        proxy_pass http://backend/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 3. 数据持久化

使用 Docker Volume 或绑定挂载确保数据持久化：

```yaml
volumes:
  postgres_data:
    driver: local
  mongodb_data:
    driver: local
```

### 4. 健康检查

配置健康检查确保服务可用：

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5181/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

## 故障排查

### 容器无法启动

```bash
# 检查容器状态
docker-compose ps

# 查看错误日志
docker-compose logs backend

# 检查端口占用
lsof -i :5181
```

### 数据库连接失败

```bash
# 检查数据库是否就绪
docker-compose exec postgres pg_isready

# 检查网络连接
docker-compose exec backend ping postgres
```

### 前端构建失败

```bash
# 清除缓存重新构建
docker-compose build --no-cache frontend
```

---

**相关文档**：
- [本地开发](./development/local-setup.md)
- [环境配置](./environment.md)
