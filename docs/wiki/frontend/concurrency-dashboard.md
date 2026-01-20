# 并发请求运行中控大屏

<cite>
**本文档引用的文件**
- [frontend/src/router/index.ts](file://frontend/src/router/index.ts)
- [frontend/src/views/ConcurrencySimulatorView.vue](file://frontend/src/views/ConcurrencySimulatorView.vue)
- [backend/src/modules/ops/ops.controller.ts](file://backend/src/modules/ops/ops.controller.ts)
</cite>

## 目录
1. [目标与入口](#目标与入口)
2. [数据来源](#数据来源)
3. [界面区域](#界面区域)
4. [事件与告警逻辑](#事件与告警逻辑)
5. [配置授权流程](#配置授权流程)
6. [生命周期](#生命周期)

## 目标与入口
- 路由入口：`/ops/concurrency-dashboard`。
- 页面聚焦系统实时运作、队列压力与事件链路状态，用于运行时监控与决策。

**Section sources**
- [frontend/src/router/index.ts](file://frontend/src/router/index.ts#L1-L23)
- [frontend/src/views/ConcurrencySimulatorView.vue](file://frontend/src/views/ConcurrencySimulatorView.vue#L1-L24)

## 数据来源
- 页面通过 EventSource 订阅 `/ops/stream` 获取队列、任务日志与会话运行态。
- 后端 Ops 模块以 SSE 形式每秒推送数据。

**Section sources**
- [frontend/src/views/ConcurrencySimulatorView.vue](file://frontend/src/views/ConcurrencySimulatorView.vue#L670-L889)
- [backend/src/modules/ops/ops.controller.ts](file://backend/src/modules/ops/ops.controller.ts#L1-L58)

## 界面区域
- 顶部指标卡：总排队、执行中、活动会话、最近刷新、队列压力、调度频率。
- 队列监控：分桶排队、冷却、延迟与并发使用率。
- 运行中会话：活动会话列表与时长。
- 事件链路日志与任务日志：展示运行事件与任务链路明细。
- 系统参数：限流矩阵与能力策略展示。

**Section sources**
- [frontend/src/views/ConcurrencySimulatorView.vue](file://frontend/src/views/ConcurrencySimulatorView.vue#L1-L240)

## 事件与告警逻辑
队列状态变化触发事件记录，例如限流、排队开始/清空、并发触顶等。

**Section sources**
- [frontend/src/views/ConcurrencySimulatorView.vue](file://frontend/src/views/ConcurrencySimulatorView.vue#L640-L666)

## 配置授权流程
页面进入时同步系统配置，若设置了安全密码则引导验证并打开设置抽屉。

**Section sources**
- [frontend/src/views/ConcurrencySimulatorView.vue](file://frontend/src/views/ConcurrencySimulatorView.vue#L721-L809)

## 生命周期
页面挂载时启动运行流连接与时钟，卸载时断开连接并停止定时器。

**Section sources**
- [frontend/src/views/ConcurrencySimulatorView.vue](file://frontend/src/views/ConcurrencySimulatorView.vue#L813-L894)
