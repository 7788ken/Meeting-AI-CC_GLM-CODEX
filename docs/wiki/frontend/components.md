# 前端组件

<cite>
**本文档引用的文件**
- [frontend/src/components/AppHeader.vue](file://frontend/src/components/AppHeader.vue)
- [frontend/src/components/MainLayout.vue](file://frontend/src/components/MainLayout.vue)
- [frontend/src/components/MeetingActionBar.vue](file://frontend/src/components/MeetingActionBar.vue)
- [frontend/src/components/MicPermission.vue](file://frontend/src/components/MicPermission.vue)
- [frontend/src/components/ModelSelector.vue](file://frontend/src/components/ModelSelector.vue)
- [frontend/src/components/TranscriptEventSegmentsPanel.vue](file://frontend/src/components/TranscriptEventSegmentsPanel.vue)
- [frontend/src/components/SettingsDrawer.vue](file://frontend/src/components/SettingsDrawer.vue)
- [frontend/src/components/DebugDrawer.vue](file://frontend/src/components/DebugDrawer.vue)
</cite>

## 目录
1. [组件概览](#组件概览)
2. [AppHeader](#appheader)
3. [MainLayout](#mainlayout)
4. [MeetingActionBar](#meetingactionbar)
5. [MicPermission](#micpermission)
6. [ModelSelector](#modelselector)
7. [TranscriptEventSegmentsPanel](#transcripteventsegmentspanel)
8. [SettingsDrawer](#settingsdrawer)
9. [DebugDrawer](#debugdrawer)

## 组件概览
- 布局/容器：MainLayout
- 页头与状态：AppHeader
- 会议控制：MeetingActionBar、MicPermission
- 数据面板：TranscriptEventSegmentsPanel
- 系统设置与调试：SettingsDrawer、DebugDrawer
- 选择器：ModelSelector

**Section sources**
- [frontend/src/components/MainLayout.vue](file://frontend/src/components/MainLayout.vue#L1-L15)
- [frontend/src/components/AppHeader.vue](file://frontend/src/components/AppHeader.vue#L1-L41)
- [frontend/src/components/MeetingActionBar.vue](file://frontend/src/components/MeetingActionBar.vue#L1-L173)
- [frontend/src/components/MicPermission.vue](file://frontend/src/components/MicPermission.vue#L1-L199)
- [frontend/src/components/TranscriptEventSegmentsPanel.vue](file://frontend/src/components/TranscriptEventSegmentsPanel.vue#L1-L149)
- [frontend/src/components/SettingsDrawer.vue](file://frontend/src/components/SettingsDrawer.vue#L1-L1560)
- [frontend/src/components/DebugDrawer.vue](file://frontend/src/components/DebugDrawer.vue#L1-L360)
- [frontend/src/components/ModelSelector.vue](file://frontend/src/components/ModelSelector.vue#L1-L57)

## AppHeader
- 用于会议页头部，展示标题与会话状态标签。
- Props：`title`、`showBackButton`、`status`（active/ended）。
- Emits：`back`。

**Section sources**
- [frontend/src/components/AppHeader.vue](file://frontend/src/components/AppHeader.vue#L1-L41)

## MainLayout
- 页面骨架，提供 `header` 具名插槽与默认内容区域。

**Section sources**
- [frontend/src/components/MainLayout.vue](file://frontend/src/components/MainLayout.vue#L1-L15)

## MeetingActionBar
- 会议操作栏，包含录音、静音、结束会话与快捷键入口。
- Props：`enabled`、`compact`、`disabled`、`ending`、`isSessionEnded`、`recordingStatus`、`isPaused`。
- Emits：`toggle-recording`、`toggle-mute`、`end-session`、`toggle-realtime`。
- 暴露方法：`openHelp` 与 `hostEl`。

**Section sources**
- [frontend/src/components/MeetingActionBar.vue](file://frontend/src/components/MeetingActionBar.vue#L1-L173)

## MicPermission
- 麦克风权限引导对话框，自动检测与请求权限。
- Props：`modelValue`、`autoCheck`。
- Emits：`update:modelValue`、`granted`、`denied`、`cancel`。

**Section sources**
- [frontend/src/components/MicPermission.vue](file://frontend/src/components/MicPermission.vue#L1-L199)

## ModelSelector
- AI 模型下拉选择器。
- Props：`modelValue`、`disabled`、`placeholder`、`size`。
- Emits：`update:modelValue`、`change`。

**Section sources**
- [frontend/src/components/ModelSelector.vue](file://frontend/src/components/ModelSelector.vue#L1-L50)

## TranscriptEventSegmentsPanel
- 语句拆分列表面板，支持进度提示与快速分析入口。
- Props：`segments`、`order`、`loading`、`progress`、`highlightedSegmentId`、`translationEnabled`、`displayMode`。
- Emits：`select-range`、`target-analysis`。

**Section sources**
- [frontend/src/components/TranscriptEventSegmentsPanel.vue](file://frontend/src/components/TranscriptEventSegmentsPanel.vue#L1-L149)

## SettingsDrawer
- 系统设置抽屉，提供 AI 模型、转写、拆分、分析、提示词库等配置入口。
- Props：`modelValue`。
- Emits：`update:modelValue`。

**Section sources**
- [frontend/src/components/SettingsDrawer.vue](file://frontend/src/components/SettingsDrawer.vue#L1-L1560)

## DebugDrawer
- 会话调试抽屉，包含报错列表/详情与日志面板。
- Props：`modelValue`、`sessionId`。
- Emits：`update:modelValue`。

**Section sources**
- [frontend/src/components/DebugDrawer.vue](file://frontend/src/components/DebugDrawer.vue#L1-L360)
