# 后端 Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package.json
COPY package.json ./

# 安装依赖（包含 dev 依赖以支持构建）
RUN npm install --include=dev --no-package-lock

# 复制源代码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 确认 TypeScript 可用
RUN node -e "const ts = require('typescript'); console.log('TypeScript version', ts.version)"

# 构建
RUN npm run build

# 生产环境镜像
FROM node:20-alpine

WORKDIR /app

# 复制 package.json 和 Prisma schema（postinstall 需要 schema）
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

# 只安装生产依赖
RUN npm install --omit=dev --no-package-lock

# 复制构建产物
COPY --from=builder /app/dist ./dist

EXPOSE 5181

CMD ["node", "dist/src/main.js"]
