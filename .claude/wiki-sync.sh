#!/bin/bash
# Wiki 同步脚本
# 将 docs/wiki/ 目录的内容同步到指定的 Wiki 仓库

set -e

WIKI_REPO="${WIKI_REPO:-}"
WIKI_DIR="/tmp/meeting-ai-wiki"

if [ -z "$WIKI_REPO" ]; then
  echo "⏭️  WIKI_REPO 未设置，跳过 Wiki 同步"
  echo "   设置环境变量: export WIKI_REPO=git@github.com:org/repo.wiki.git"
  exit 0
fi

echo "📚 开始同步 Wiki 文档..."

# 克隆 Wiki 仓库
if [ -d "$WIKI_DIR" ]; then
  cd "$WIKI_DIR"
  git pull
else
  git clone "$WIKI_REPO" "$WIKI_DIR"
  cd "$WIKI_DIR"
fi

# 复制文档
cp -r "$(dirname "$0")/../docs/wiki/"* . 2>/dev/null || true

# 提交更改
git add .
if git diff --staged --quiet; then
  echo "✅ Wiki 文档已是最新，无需更新"
else
  git commit -m "docs: 更新文档 $(date '+%Y-%m-%d %H:%M:%S')"
  git push
  echo "✅ Wiki 文档同步完成"
fi
