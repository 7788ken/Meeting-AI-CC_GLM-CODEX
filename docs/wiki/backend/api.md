# 后端 API 参考

<cite>
**本文档引用的文件**
- [backend/src/main.ts](file://backend/src/main.ts)
- [backend/src/app.module.ts](file://backend/src/app.module.ts)
- [backend/src/app.controller.ts](file://backend/src/app.controller.ts)
- [backend/src/modules/auth/auth.controller.ts](file://backend/src/modules/auth/auth.controller.ts)
- [backend/src/modules/session/session.controller.ts](file://backend/src/modules/session/session.controller.ts)
- [backend/src/modules/speech/speech.controller.ts](file://backend/src/modules/speech/speech.controller.ts)
- [backend/src/modules/transcript-stream/transcript-stream.controller.ts](file://backend/src/modules/transcript-stream/transcript-stream.controller.ts)
- [backend/src/modules/transcript-event-segmentation/transcript-event-segmentation.controller.ts](file://backend/src/modules/transcript-event-segmentation/transcript-event-segmentation.controller.ts)
- [backend/src/modules/transcript-analysis/transcript-analysis.controller.ts](file://backend/src/modules/transcript-analysis/transcript-analysis.controller.ts)
- [backend/src/modules/app-config/app-config.controller.ts](file://backend/src/modules/app-config/app-config.controller.ts)
- [backend/src/modules/prompt-library/prompt-library.controller.ts](file://backend/src/modules/prompt-library/prompt-library.controller.ts)
- [backend/src/modules/ops/ops.controller.ts](file://backend/src/modules/ops/ops.controller.ts)
- [backend/src/modules/debug-error/debug-error.controller.ts](file://backend/src/modules/debug-error/debug-error.controller.ts)
- [backend/src/modules/app-log/app-log.controller.ts](file://backend/src/modules/app-log/app-log.controller.ts)
</cite>

## 目录
1. [基础信息与认证](#基础信息与认证)
2. [健康检查](#健康检查)
3. [认证与令牌](#认证与令牌)
4. [会话 Sessions](#会话-sessions)
5. [发言记录 Speeches](#发言记录-speeches)
6. [原文事件流 Transcript Stream](#原文事件流-transcript-stream)
7. [语句拆分 Transcript Event Segmentation](#语句拆分-transcript-event-segmentation)
8. [AI 分析 Transcript Analysis](#ai-分析-transcript-analysis)
9. [配置与提示词](#配置与提示词)
10. [运行中控 Ops](#运行中控-ops)
11. [调试错误 Debug Errors](#调试错误-debug-errors)
12. [应用日志 App Logs](#应用日志-app-logs)

## 基础信息与认证
- API 前缀：默认 `/api`。
- Swagger：`/api/docs`。
- WebSocket：`/transcript`（原生 WebSocket）。
- 默认启用 JWT 全局守卫，标注 `@Public()` 的接口开放访问。

**Section sources**
- [backend/src/main.ts](file://backend/src/main.ts#L74-L130)
- [backend/src/app.module.ts](file://backend/src/app.module.ts#L52-L67)
- [backend/src/modules/session/session.controller.ts](file://backend/src/modules/session/session.controller.ts#L1-L61)

## 健康检查
- `GET /`：健康检查。
- `GET /health`：详细健康检查。

**Section sources**
- [backend/src/app.controller.ts](file://backend/src/app.controller.ts#L1-L22)

## 认证与令牌
- `POST /auth/register`：注册。
- `POST /auth/login`：登录。
- `POST /auth/refresh`：刷新令牌。

**Section sources**
- [backend/src/modules/auth/auth.controller.ts](file://backend/src/modules/auth/auth.controller.ts#L1-L27)

## 会话 Sessions
- `POST /sessions`：创建会话。
- `GET /sessions`：获取全部会话。
- `GET /sessions/:id`：获取会话详情。
- `POST /sessions/:id/end`：结束会话。
- `POST /sessions/:id/archive`：存档会话。
- `POST /sessions/:id/unarchive`：取消存档。
- `DELETE /sessions/:id`：删除会话。

**Section sources**
- [backend/src/modules/session/session.controller.ts](file://backend/src/modules/session/session.controller.ts#L1-L71)

## 发言记录 Speeches
- `POST /speeches`：创建发言。
- `POST /speeches/batch`：批量创建发言。
- `GET /speeches/session/:sessionId`：获取会话发言列表。
- `GET /speeches/session/:sessionId/search?keyword=`：搜索发言。
- `GET /speeches/:id`：获取发言详情。
- `PUT /speeches/:id`：更新发言。
- `PUT /speeches/:id/mark`：标记/取消标记。
- `DELETE /speeches/session/:sessionId`：删除会话全部发言。

**Section sources**
- [backend/src/modules/speech/speech.controller.ts](file://backend/src/modules/speech/speech.controller.ts#L1-L130)

## 原文事件流 Transcript Stream
- `GET /transcript-stream/session/:sessionId?limit=`：获取会话原文事件流快照。

**Section sources**
- [backend/src/modules/transcript-stream/transcript-stream.controller.ts](file://backend/src/modules/transcript-stream/transcript-stream.controller.ts#L1-L21)

## 语句拆分 Transcript Event Segmentation
- `GET /transcript-event-segmentation/session/:sessionId`：获取语句拆分快照。
- `POST /transcript-event-segmentation/session/:sessionId/rebuild`：重拆语句结果。
- `GET /transcript-event-segmentation/config`：获取拆分配置（需要设置密码）。
- `POST /transcript-event-segmentation/config/reset`：重置拆分配置（需要设置密码）。
- `PUT /transcript-event-segmentation/config`：更新拆分配置（需要设置密码）。

**Section sources**
- [backend/src/modules/transcript-event-segmentation/transcript-event-segmentation.controller.ts](file://backend/src/modules/transcript-event-segmentation/transcript-event-segmentation.controller.ts#L1-L89)

## AI 分析 Transcript Analysis
- `GET /transcript-analysis/config`：获取分析提示词配置（需要设置密码）。
- `POST /transcript-analysis/config/reset`：重置分析提示词配置（需要设置密码）。
- `PUT /transcript-analysis/config`：更新分析提示词配置（需要设置密码）。
- `GET /transcript-analysis/session/:sessionId/summary`：获取已生成的会话总结。
- `POST /transcript-analysis/session/:sessionId/summary`：生成会话总结。
- `GET /transcript-analysis/session/:sessionId/segment/:segmentId/analysis`：获取语句分析。
- `POST /transcript-analysis/session/:sessionId/segment/:segmentId/analysis`：生成语句分析。
- `GET /transcript-analysis/session/:sessionId/summary/stream`：SSE 流式总结。
- `GET /transcript-analysis/session/:sessionId/segment/:segmentId/analysis/stream`：SSE 流式语句分析。

**Section sources**
- [backend/src/modules/transcript-analysis/transcript-analysis.controller.ts](file://backend/src/modules/transcript-analysis/transcript-analysis.controller.ts#L1-L201)

## 配置与提示词
- `GET /app-config`：读取后端配置（需要设置密码）。
- `PUT /app-config`：更新后端配置（需要设置密码）。
- `GET /app-config/security/status`：获取设置密码状态。
- `POST /app-config/security/verify`：校验设置密码。
- `PUT /app-config/security/password`：设置/更新设置密码。
- `GET /app-config/remarks`：获取配置说明（需要设置密码）。
- `GET /app-config/queue-stats`：获取 AI 队列统计。
- `GET /prompt-library`：获取提示词库（需要设置密码）。
- `POST /prompt-library`：创建提示词（需要设置密码）。
- `PUT /prompt-library/:id`：更新提示词（需要设置密码）。
- `DELETE /prompt-library/:id`：删除提示词（需要设置密码）。

**Section sources**
- [backend/src/modules/app-config/app-config.controller.ts](file://backend/src/modules/app-config/app-config.controller.ts#L1-L149)
- [backend/src/modules/prompt-library/prompt-library.controller.ts](file://backend/src/modules/prompt-library/prompt-library.controller.ts#L1-L55)

## 运行中控 Ops
- `GET /ops/stream`：SSE 推送队列、任务日志与会话运行态。

**Section sources**
- [backend/src/modules/ops/ops.controller.ts](file://backend/src/modules/ops/ops.controller.ts#L1-L58)

## 调试错误 Debug Errors
- `GET /debug-errors/session/:sessionId`：获取会话调试错误列表。
- `GET /debug-errors/:id`：获取单条调试错误详情。
- `DELETE /debug-errors/session/:sessionId`：清空会话调试错误。

**Section sources**
- [backend/src/modules/debug-error/debug-error.controller.ts](file://backend/src/modules/debug-error/debug-error.controller.ts#L1-L50)

## 应用日志 App Logs
- `GET /app-logs/session/:sessionId?type=&limit=`：获取会话日志。
- `DELETE /app-logs/session/:sessionId?type=`：清空会话日志。

**Section sources**
- [backend/src/modules/app-log/app-log.controller.ts](file://backend/src/modules/app-log/app-log.controller.ts#L1-L36)
