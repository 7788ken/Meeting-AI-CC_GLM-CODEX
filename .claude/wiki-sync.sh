#!/bin/bash
# Wiki 文档同步脚本
# 在会话结束时自动触发 wiki-doc-syncer 技能

echo "🔄 正在同步 Wiki 文档..."

# 检查是否有修改的文件
if git diff --quiet && git diff --cached --quiet; then
    echo "✅ 没有文件变更，跳过 Wiki 同步"
    exit 0
fi

echo "📝 检测到文件变更，准备更新 Wiki 文档"
# 这里的实际同步将由 wiki-doc-syncer agent 处理
# 脚本仅作为触发点和日志记录

exit 0
