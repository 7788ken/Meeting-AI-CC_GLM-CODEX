#!/bin/bash
# E2E 测试脚本 - 使用 Playwright MCP 进行浏览器验证

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

LOG_FILE=".claude/e2e-test.log"
PID_FILE=".claude/e2e-test.pid"

# 检查是否已在运行
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "E2E 测试已在运行 (PID: $OLD_PID)，跳过" >> "$LOG_FILE"
        exit 0
    fi
fi

# 启动后台测试任务
(
    echo "===== E2E 测试开始 $(date) =====" >> "$LOG_FILE"
    
    # 检查是否有修改的文件
    if git diff --quiet && git diff --cached --quiet; then
        echo "没有文件变更，跳过 E2E 测试" >> "$LOG_FILE"
    else
        # 检查是否修改了前端代码
        FRONTEND_CHANGES=$(git diff --name-only HEAD 2>/dev/null | grep -E '^frontend/' || true)
        
        if [ -z "$FRONTEND_CHANGES" ]; then
            echo "没有前端代码变更，跳过 E2E 测试" >> "$LOG_FILE"
        else
            echo "检测到前端代码变更，准备运行 E2E 测试..." >> "$LOG_FILE"
            
            # 检查前端开发服务器是否运行
            if ! curl -s http://localhost:5173 > /dev/null; then
                echo "前端开发服务器未运行，跳过 E2E 测试" >> "$LOG_FILE"
                echo "提示: 启动前端服务器: cd frontend && npm run dev" >> "$LOG_FILE"
            else
                echo "前端服务正在运行，可以执行 Playwright MCP 测试" >> "$LOG_FILE"
                
                # 这里会触发 Playwright MCP 测试
                # 实际测试需要在 AI 助手中使用 MCP 工具
                echo "Playwright MCP 测试已就绪" >> "$LOG_FILE"
            fi
        fi
    fi
    
    echo "===== E2E 测试完成 $(date) =====" >> "$LOG_FILE"
) &

echo $! > "$PID_FILE"
echo "E2E 测试已启动 (PID: $!)"
echo "查看日志: tail -f $LOG_FILE"

exit 0
