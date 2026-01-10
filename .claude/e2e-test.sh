#!/bin/bash
# E2E 测试脚本 - 使用 Playwright CLI 进行测试

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

LOG_FILE=".claude/e2e-test.log"

echo "===== E2E 测试开始 $(date) =====" | tee -a "$LOG_FILE"

# 检查是否有文件变更
if git diff --quiet && git diff --cached --quiet 2>/dev/null; then
    echo "没有文件变更，跳过 E2E 测试" | tee -a "$LOG_FILE"
    exit 0
fi

# 检查是否修改了前端代码
FRONTEND_CHANGES=$(git diff --name-only HEAD 2>/dev/null | grep -E '^frontend/' || true)

if [ -z "$FRONTEND_CHANGES" ]; then
    echo "没有前端代码变更，跳过 E2E 测试" | tee -a "$LOG_FILE"
    exit 0
fi

echo "检测到前端代码变更:" | tee -a "$LOG_FILE"
echo "$FRONTEND_CHANGES" | tee -a "$LOG_FILE"

# 动态检测前端端口
FRONTEND_PORT=""
for port in 5173 5174 5175 5180 5181 5182; do
    if curl -s "http://localhost:$port" > /dev/null 2>&1; then
        FRONTEND_PORT=$port
        break
    fi
done

BACKEND_PORT=""
if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    BACKEND_PORT=8000
fi

# 服务状态检查
if [ -z "$FRONTEND_PORT" ]; then
    echo "⚠️  前端服务未运行 (检测端口: 5173-5182)" | tee -a "$LOG_FILE"
    FRONTEND_RUNNING=false
else
    echo "✅ 前端服务运行在: http://localhost:$FRONTEND_PORT" | tee -a "$LOG_FILE"
    FRONTEND_RUNNING=true
fi

if [ -z "$BACKEND_PORT" ]; then
    echo "⚠️  后端服务未运行 (端口 8000)" | tee -a "$LOG_FILE"
    BACKEND_RUNNING=false
else
    echo "✅ 后端服务运行在: http://localhost:$BACKEND_PORT" | tee -a "$LOG_FILE"
    BACKEND_RUNNING=true
fi

# 如果服务未运行，跳过测试
if [ "$FRONTEND_RUNNING" = false ] || [ "$BACKEND_RUNNING" = false ]; then
    echo "⏭️  服务未完全运行，跳过 E2E 测试" | tee -a "$LOG_FILE"
    echo "   提示: 使用 'docker-compose up -d' 启动服务" | tee -a "$LOG_FILE"
    exit 0
fi

# 运行 Playwright E2E 测试
echo "🧪 开始运行 E2E 测试..." | tee -a "$LOG_FILE"

cd frontend

# 更新测试配置中的 URL
cat > tests/e2e/config.ts << 'EOF'
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
EOF

# 运行测试
FRONTEND_URL="http://localhost:$FRONTEND_PORT" \
BACKEND_URL="http://localhost:$BACKEND_PORT" \
npx playwright test --project=chromium tests/e2e/ 2>&1 | tee -a "$LOG_FILE"

TEST_EXIT_CODE=${PIPESTATUS[0]}

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ E2E 测试全部通过" | tee -a "$LOG_FILE"
else
    echo "❌ E2E 测试失败 (退出码: $TEST_EXIT_CODE)" | tee -a "$LOG_FILE"
fi

echo "===== E2E 测试完成 $(date) =====" | tee -a "$LOG_FILE"

exit $TEST_EXIT_CODE
