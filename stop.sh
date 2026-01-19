#!/bin/bash
# Meeting-AI 开发环境关闭脚本

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

echo -e "${BLUE}🛑 关闭 Meeting-AI 开发环境${NC}"

stop_pid_file() {
    local service_name=$1
    local pid_file=$2

    if [ ! -f "$pid_file" ]; then
        return 1
    fi

    local pid
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [ -z "$pid" ]; then
        rm -f "$pid_file"
        return 1
    fi

    if ! ps -p "$pid" > /dev/null 2>&1; then
        rm -f "$pid_file"
        return 1
    fi

    echo -e "${BLUE}▶ 停止${service_name}服务...${NC}"
    kill "$pid" 2>/dev/null || true
    local waited=0
    while ps -p "$pid" > /dev/null 2>&1 && [ $waited -lt 5 ]; do
        sleep 1
        waited=$((waited + 1))
    done
    if ps -p "$pid" > /dev/null 2>&1; then
        kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
    echo -e "${GREEN}✅ ${service_name}服务已停止${NC}"
    return 0
}

# 停止后端进程
stop_backend() {
    if stop_pid_file "后端" "$BACKEND_PID_FILE"; then
        return
    fi

    echo -e "${BLUE}▶ 停止后端服务...${NC}"
    local backend_pids=$(pgrep -f "$PROJECT_ROOT/backend" || true)
    if [ -n "$backend_pids" ]; then
        echo "$backend_pids" | xargs kill 2>/dev/null || true
        sleep 1
        echo "$backend_pids" | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✅ 后端服务已停止${NC}"
    else
        echo -e "${YELLOW}⚠️  未找到后端进程${NC}"
    fi
}

# 停止前端进程
stop_frontend() {
    if stop_pid_file "前端" "$FRONTEND_PID_FILE"; then
        return
    fi

    echo -e "${BLUE}▶ 停止前端服务...${NC}"
    local frontend_pids=$(pgrep -f "$PROJECT_ROOT/frontend" || true)
    if [ -n "$frontend_pids" ]; then
        echo "$frontend_pids" | xargs kill 2>/dev/null || true
        sleep 1
        echo "$frontend_pids" | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✅ 前端服务已停止${NC}"
    else
        echo -e "${YELLOW}⚠️  未找到前端进程${NC}"
    fi
}

# 停止 Docker 容器
stop_docker() {
    echo -e "${BLUE}▶ 停止 Docker 容器...${NC}"
    
    if ! command -v docker &>/dev/null; then
        echo -e "${YELLOW}⚠️  Docker 未安装${NC}"
        return
    fi

    if ! docker info &>/dev/null; then
        echo -e "${YELLOW}⚠️  Docker daemon 未运行${NC}"
        return
    fi

    # 停止当前项目的容器
    cd "$PROJECT_ROOT"
    docker compose down 2>/dev/null || true
    echo -e "${GREEN}✅ Docker 容器已停止${NC}"
}

# 主菜单
show_menu() {
    echo ""
    echo -e "${YELLOW}请选择关闭方式:${NC}"
    echo "1) 只停止前端和后端服务（保持 Docker 容器运行）"
    echo "2) 停止所有服务（包括 Docker 容器）"
    echo "3) 停止所有服务并关闭 Colima"
    echo "q) 退出"
    echo ""
}

# 执行选择
execute_choice() {
    case $1 in
        1)
            stop_backend
            stop_frontend
            echo ""
            echo -e "${GREEN}✅ 前端和后端服务已关闭${NC}"
            echo -e "${BLUE}Docker 容器仍在运行${NC}"
            ;;
        2)
            stop_backend
            stop_frontend
            stop_docker
            echo ""
            echo -e "${GREEN}✅ 所有服务已关闭${NC}"
            ;;
        3)
            stop_backend
            stop_frontend
            stop_docker
            
            echo -e "${BLUE}▶ 关闭 Colima...${NC}"
            if command -v colima &>/dev/null; then
                colima stop 2>/dev/null || true
                echo -e "${GREEN}✅ Colima 已关闭${NC}"
            else
                echo -e "${YELLOW}⚠️  Colima 未安装${NC}"
            fi
            echo ""
            echo -e "${GREEN}✅ 所有服务已关闭${NC}"
            ;;
        q|Q)
            echo "已取消"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ 无效选择${NC}"
            exit 1
            ;;
    esac
}

# 如果提供了参数，直接执行；否则显示菜单
if [ $# -eq 0 ]; then
    show_menu
    read -p "请输入选择 (1/2/3/q): " choice
    execute_choice "$choice"
else
    execute_choice "$1"
fi

echo ""
