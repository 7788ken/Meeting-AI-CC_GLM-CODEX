# 贡献指南

感谢你愿意参与 Meeting-AI！请在提交前阅读以下约定，帮助我们保持代码质量与协作效率。

## 提交前检查

- 请先搜索已有 Issue/PR，避免重复工作。
- 变更越小越好，保持单一目的，便于审阅与回滚。
- 不要提交密钥、Token、账号密码等敏感信息。

## 开发环境

- Node.js（建议使用 LTS）
- pnpm（仓库使用 pnpm workspace）
- Docker（后端依赖 PostgreSQL/MongoDB 时需要）

安装依赖：

```bash
pnpm install
```

本地开发：

```bash
pnpm dev:frontend
pnpm dev:backend
```

## 代码规范

- 使用现有 ESLint/Prettier 规则，不在 PR 中引入无关格式化。
- 保持函数/模块职责单一，避免过度抽象。
- 如有复用场景，请优先提取公共逻辑。

## 测试与质量

提交前请至少运行以下检查：

```bash
pnpm lint:frontend
pnpm lint:backend
pnpm --dir frontend test
pnpm --dir backend test
```

如变更涉及关键路径，请补充或更新测试用例。

## 提交流程

1. Fork 仓库并创建分支（建议：`feat/`、`fix/`、`docs/`、`chore/`）
2. 确保功能可运行且通过测试
3. 提交 PR，说明背景、变更点、影响范围和验证方式

如有任何问题，欢迎在 Issue 中讨论。
