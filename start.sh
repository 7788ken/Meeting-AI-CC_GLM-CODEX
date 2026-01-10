#!/bin/bash
# Meeting-AI 开发环境启动脚本

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 启动 Meeting-AI 开发环境${NC}"

# 检查端口占用
check_port() {
    local port=$1
    if lsof -i ":$port" &>/dev/null; then
        echo -e "${GREEN}⚠️  端口 $port 已被占用，跳过启动${NC}"
        return 1
    fi
    return 0
}

# 启动后端
if check_port 5181; then
    echo -e "${GREEN}▶ 启动后端服务 (端口 5181)...${NC}"
    cd "$PROJECT_ROOT/backend" && pnpm start:dev &
    BACKEND_PID=$!
    echo "后端 PID: $BACKEND_PID"
fi

# 启动前端
if check_port 5180; then
    echo -e "${GREEN}▶ 启动前端服务 (端口 5180)...${NC}"
    cd "$PROJECT_ROOT/frontend" && pnpm dev &
    FRONTEND_PID=$!
    echo "前端 PID: $FRONTEND_PID"
fi

echo -e "${GREEN}✅ 开发环境已启动！${NC}"
echo -e "  前端: ${BLUE}http://localhost:5180${NC}"
echo -e "  后端: ${BLUE}http://localhost:5181${NC}"
echo -e "  API文档: ${BLUE}http://localhost:5181/api/docs${NC}"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待子进程
wait
