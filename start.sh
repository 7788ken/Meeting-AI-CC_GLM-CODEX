#!/bin/bash
# Meeting-AI 开发环境启动脚本

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$PROJECT_ROOT/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 检查结果计数
CHECKS_PASSED=0
CHECKS_FAILED=0

echo -e "${BLUE}🚀 启动 Meeting-AI 开发环境${NC}"
echo ""

# ==================== 准备检查阶段 ====================
echo -e "${BLUE}▶ 执行启动前准备检查...${NC}"
echo ""

# 检查 Node.js
check_nodejs() {
    echo -n "检查 Node.js... "
    if command -v node &>/dev/null; then
        local version=$(node --version)
        echo -e "${GREEN}✅ $version${NC}"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ 未安装${NC}"
        echo "  → 请安装 Node.js: https://nodejs.org"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# 检查 pnpm
check_pnpm() {
    echo -n "检查 pnpm... "
    if command -v pnpm &>/dev/null; then
        local version=$(pnpm --version)
        echo -e "${GREEN}✅ $version${NC}"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ 未安装${NC}"
        echo "  → 请安装 pnpm: npm install -g pnpm"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# 检查后端项目文件
check_backend_files() {
    echo -n "检查后端项目文件... "
    if [ -d "$PROJECT_ROOT/backend" ] && [ -f "$PROJECT_ROOT/backend/package.json" ]; then
        echo -e "${GREEN}✅ 存在${NC}"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ 不存在${NC}"
        echo "  → 后端目录: $PROJECT_ROOT/backend"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# 检查前端项目文件
check_frontend_files() {
    echo -n "检查前端项目文件... "
    if [ -d "$PROJECT_ROOT/frontend" ] && [ -f "$PROJECT_ROOT/frontend/package.json" ]; then
        echo -e "${GREEN}✅ 存在${NC}"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ 不存在${NC}"
        echo "  → 前端目录: $PROJECT_ROOT/frontend"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# 检查后端依赖
check_backend_deps() {
    echo -n "检查后端依赖... "
    if [ -d "$PROJECT_ROOT/backend/node_modules" ]; then
        echo -e "${GREEN}✅ 已安装${NC}"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${YELLOW}⚠️  未安装${NC}"
        echo "  → 正在安装后端依赖..."
        cd "$PROJECT_ROOT/backend" && pnpm install > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ 后端依赖安装成功${NC}"
            ((CHECKS_PASSED++))
            return 0
        else
            echo -e "${RED}❌ 后端依赖安装失败${NC}"
            ((CHECKS_FAILED++))
            return 1
        fi
    fi
}

# 检查前端依赖
check_frontend_deps() {
    echo -n "检查前端依赖... "
    if [ -d "$PROJECT_ROOT/frontend/node_modules" ]; then
        echo -e "${GREEN}✅ 已安装${NC}"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${YELLOW}⚠️  未安装${NC}"
        echo "  → 正在安装前端依赖..."
        cd "$PROJECT_ROOT/frontend" && pnpm install > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ 前端依赖安装成功${NC}"
            ((CHECKS_PASSED++))
            return 0
        else
            echo -e "${RED}❌ 前端依赖安装失败${NC}"
            ((CHECKS_FAILED++))
            return 1
        fi
    fi
}

# 检查 Docker
check_docker() {
    echo -n "检查 Docker... "
    if ! command -v docker &>/dev/null; then
        echo -e "${RED}❌ 未安装${NC}"
        echo "  → 请安装 Colima: brew install colima"
        ((CHECKS_FAILED++))
        return 1
    fi

    # 检查 Docker daemon 是否运行
    if docker info &>/dev/null 2>&1; then
        echo -e "${GREEN}✅ 已运行${NC}"
        ((CHECKS_PASSED++))
        return 0
    fi

    # Docker daemon 未运行，尝试启动
    echo -e "${YELLOW}⚠️  未运行${NC}"
    echo "  → 正在启动 Colima..."
    
    if command -v colima &>/dev/null; then
        if colima start > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Colima 已启动${NC}"
            sleep 2
            ((CHECKS_PASSED++))
            return 0
        else
            echo -e "${RED}❌ Colima 启动失败${NC}"
            ((CHECKS_FAILED++))
            return 1
        fi
    else
        echo -e "${RED}❌ Colima 未安装${NC}"
        echo "  → 请安装: brew install colima"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# 检查 Docker 容器状态
check_docker_compose_files() {
    echo -n "检查 Docker Compose 文件... "
    if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
        echo -e "${GREEN}✅ 存在${NC}"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ 不存在${NC}"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# 检查端口
check_port() {
    local port=$1
    local service=$2
    echo -n "检查端口 $port ($service)... "
    
    if lsof -i ":$port" &>/dev/null 2>&1; then
        local process_info=$(lsof -i ":$port" 2>/dev/null | tail -1)
        local process_name=$(echo "$process_info" | awk '{print $1}')
        local process_pid=$(echo "$process_info" | awk '{print $2}')
        
        # 如果是 ssh (Colima 后台进程)，可以忽略
        if [ "$process_name" = "ssh" ]; then
            echo -e "${GREEN}✅ 可用${NC} (Colima 后台进程占用，不影响)"
            ((CHECKS_PASSED++))
            return 0
        fi
        
        echo -e "${RED}❌ 已被占用${NC}"
        echo "  → $process_name (PID: $process_pid)"
        echo "  → 解决方案: lsof -i :$port -t | xargs kill -9"
        ((CHECKS_FAILED++))
        return 1
    else
        echo -e "${GREEN}✅ 可用${NC}"
        ((CHECKS_PASSED++))
        return 0
    fi
}

# ==================== 执行所有检查 ====================
echo "📋 系统环境检查："
check_nodejs
check_pnpm
check_docker

echo ""
echo "📋 项目文件检查："
check_backend_files
check_frontend_files
check_docker_compose_files

echo ""
echo "📋 依赖检查："
check_backend_deps
check_frontend_deps

echo ""
echo "📋 Docker 检查："
check_docker

echo ""
echo "📋 端口可用性检查："
check_port 5432 "PostgreSQL"
check_port 27017 "MongoDB"
check_port 5181 "后端"
check_port 5180 "前端"

# ==================== 检查总结 ====================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "检查总结: ${GREEN}通过 $CHECKS_PASSED${NC} | ${RED}失败 $CHECKS_FAILED${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $CHECKS_FAILED -gt 0 ]; then
    echo ""
    echo -e "${RED}❌ 启动条件不完整，无法继续${NC}"
    echo "请根据上述错误提示修复问题后重试"
    exit 1
fi

echo -e "${GREEN}✅ 所有检查通过，继续启动服务${NC}"
echo ""

# ==================== 启动服务 ====================
echo -e "${BLUE}▶ 启动 Docker 数据库容器...${NC}"
cd "$PROJECT_ROOT"

# 清理旧的失败容器（如果存在）
docker stop meeting-ai-backend meeting-ai-frontend 2>/dev/null || true

docker compose --profile dev up -d

echo -e "${GREEN}✅ Docker 容器已启动${NC}"
echo -e "  PostgreSQL: localhost:5432"
echo -e "  MongoDB: localhost:27017"
echo ""

# 等待数据库就绪
echo -e "${BLUE}▶ 等待数据库服务就绪...${NC}"
sleep 3

# 运行时 PID 文件目录
mkdir -p "$RUN_DIR"

# 启动后端
echo -e "${BLUE}▶ 启动后端服务 (端口 5181)...${NC}"
cd "$PROJECT_ROOT/backend" || exit 1
pnpm start:dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}后端 PID: $BACKEND_PID${NC}"
sleep 2
if ps -p $BACKEND_PID > /dev/null 2>&1; then
    echo "$BACKEND_PID" > "$BACKEND_PID_FILE"
    echo -e "${GREEN}✅ 后端服务已启动${NC}"
else
    echo -e "${RED}❌ 后端启动失败${NC}"
    echo "错误日志:"
    tail -20 /tmp/backend.log
    exit 1
fi

# 启动前端
echo -e "${BLUE}▶ 启动前端服务 (端口 5180)...${NC}"
cd "$PROJECT_ROOT/frontend" || exit 1
pnpm dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}前端 PID: $FRONTEND_PID${NC}"
sleep 2
if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"
    echo -e "${GREEN}✅ 前端服务已启动${NC}"
else
    echo -e "${RED}❌ 前端启动失败${NC}"
    echo "错误日志:"
    tail -20 /tmp/frontend.log
    exit 1
fi

echo ""
echo -e "${GREEN}✅ 开发环境已启动！${NC}"
echo -e "  前端: ${BLUE}http://localhost:5180${NC}"
echo -e "  后端 API: ${BLUE}http://localhost:5181${NC}"
echo -e "  API文档: ${BLUE}http://localhost:5181/api/docs${NC}"
echo -e "  PostgreSQL: ${BLUE}localhost:5432${NC}"
echo -e "  MongoDB: ${BLUE}localhost:27017${NC}"
echo ""
echo -e "${YELLOW}📋 日志文件:${NC}"
echo -e "  后端日志: ${BLUE}/tmp/backend.log${NC}"
echo -e "  前端日志: ${BLUE}/tmp/frontend.log${NC}"
echo ""
echo -e "${YELLOW}按 Ctrl+C 停止服务${NC}"
echo ""

# 等待子进程
wait
