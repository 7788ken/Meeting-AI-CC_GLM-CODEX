#!/bin/bash
# Codex Review 后台任务脚本
# 在会话结束时异步运行 Codex 代码审查

# 获取项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 日志文件
LOG_FILE=".claude/codex-review.log"
PID_FILE=".claude/codex-review.pid"

# 检查是否已经在运行
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "Codex review 已在运行 (PID: $OLD_PID)，跳过本次执行" >> "$LOG_FILE"
        exit 0
    fi
fi

# 启动后台任务
(
    echo "===== Codex Review 开始 $(date) =====" >> "$LOG_FILE"
    
    # 检查是否有修改的文件
    if git diff --quiet && git diff --cached --quiet; then
        echo "没有文件变更，跳过 Codex review" >> "$LOG_FILE"
    else
        echo "检测到文件变更，准备运行 Codex review..." >> "$LOG_FILE"
        
        # 获取修改的文件列表
        MODIFIED_FILES=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|js|vue|py|rs|go)$' || true)
        
        if [ -z "$MODIFIED_FILES" ]; then
            echo "没有需要 review 的代码文件" >> "$LOG_FILE"
        else
            echo "待 review 文件:" >> "$LOG_FILE"
            echo "$MODIFIED_FILES" >> "$LOG_FILE"
            
            # 这里会调用 Codex CLI（需要在 PATH 中）
            # 如果 codex 命令可用，可以在这里调用
            if command -v codex &> /dev/null; then
                echo "$MODIFIED_FILES" | codex ask-codex "Review these files for code quality, potential bugs, and improvements. Provide a summary report." >> "$LOG_FILE" 2>&1
            else
                echo "Codex CLI 未安装，跳过 review" >> "$LOG_FILE"
            fi
        fi
    fi
    
    echo "===== Codex Review 完成 $(date) =====" >> "$LOG_FILE"
) &

# 保存 PID
echo $! > "$PID_FILE"

echo "Codex review 已在后台启动 (PID: $!)" 
echo "查看日志: tail -f $LOG_FILE"

exit 0
