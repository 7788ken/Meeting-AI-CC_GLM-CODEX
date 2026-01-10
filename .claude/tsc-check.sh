#!/bin/bash
# TypeScript 类型检查脚本
# 在工具使用前后自动运行，确保代码类型正确

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    exit 0
fi

# 检查是否有 tsconfig.json
if [ ! -f "tsconfig.json" ]; then
    exit 0
fi

# 检查前端 TypeScript
if [ -f "frontend/tsconfig.json" ]; then
    cd frontend
    if npx tsc --noEmit 2>/dev/null; then
        echo "✅ 前端 TypeScript 类型检查通过"
    else
        echo "⚠️ 前端 TypeScript 类型检查失败"
    fi
    cd ..
fi

# 检查后端 TypeScript
if [ -f "backend/tsconfig.json" ] || [ -f "backend/tsconfig.build.json" ]; then
    cd backend
    if npx tsc --noEmit 2>/dev/null; then
        echo "✅ 后端 TypeScript 类型检查通过"
    else
        echo "⚠️ 后端 TypeScript 类型检查失败"
    fi
    cd ..
fi

exit 0
