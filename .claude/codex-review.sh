#!/bin/bash
# Codex 代码审查脚本
# 使用 Codex CLI 对变更的代码进行审查

set -e

CODEX_CLI="${CODEX_CLI:-codex}"

# 检查 Codex CLI 是否可用
if ! command -v "$CODEX_CLI" &> /dev/null; then
  echo "⏭️  Codex CLI 未安装，跳过代码审查"
  echo "   安装方法: npm install -g @anthropic-ai/claude-code-cli"
  exit 0
fi

# 获取变更的文件
CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null || git diff --name-only)

if [ -z "$CHANGED_FILES" ]; then
  echo "📋 没有检测到代码变更，跳过审查"
  exit 0
fi

echo "🔍 开始代码审查..."
echo "📝 变更文件:"
echo "$CHANGED_FILES" | sed 's/^/   - /'

# 使用 Codex 审查变更的文件
for file in $CHANGED_FILES; do
  if [ -f "$file" ]; then
    echo ""
    echo "审查: $file"
    # 使用 Codex 分析文件
    codex review "$file" 2>/dev/null || echo "   (审查跳过: Codex 不可用)"
  fi
done

echo ""
echo "✅ 代码审查完成"
