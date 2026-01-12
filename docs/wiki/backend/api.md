# API 接口文档

## 基础信息

- **Base URL**: `http://localhost:5181/api`
- **Content-Type**: `application/json`
- **认证方式**: JWT (待实现)

## 响应格式

### 成功响应

```json
{
  "data": {
    "id": "uuid",
    "title": "会议标题"
  }
}
```

### 错误响应

```json
{
  "statusCode": 400,
  "message": "错误描述",
  "timestamp": "2025-01-10T10:00:00.000Z"
}
```

---

## 会话管理 API

### 创建会话

```http
POST /sessions
Content-Type: application/json

{
  "settings": {
    "title": "项目周会",
    "description": "讨论本周项目进展"
  }
}
```

**响应**:
```json
{
  "data": {
    "id": "session-uuid",
    "title": "项目周会",
    "description": "讨论本周项目进展",
    "startedAt": "2025-01-10T10:00:00.000Z",
    "endedAt": null,
    "duration": null,
    "isActive": true
  }
}
```

### 获取会话列表

```http
GET /sessions
```

**响应**:
```json
{
  "data": [
    {
      "id": "session-1",
      "title": "项目周会",
      "isActive": false,
      "startedAt": "2025-01-10T10:00:00.000Z",
      "endedAt": "2025-01-10T11:00:00.000Z",
      "duration": 3600
    }
  ]
}
```

### 获取会话详情

```http
GET /sessions/:id
```

### 结束会话

```http
PUT /sessions/:id/end
```

**响应**:
```json
{
  "data": {
    "id": "session-1",
    "isActive": false,
    "endedAt": "2025-01-10T11:00:00.000Z",
    "duration": 3600
  }
}
```

### 更新会话状态

```http
PUT /sessions/:id/status
Content-Type: application/json

{
  "status": "paused"
}
```

### 添加发言者

```http
POST /sessions/:id/speakers
Content-Type: application/json

{
  "name": "张三",
  "color": "#1890ff",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

### 获取发言者列表

```http
GET /sessions/:id/speakers
```

---

## 发言记录 API

### 创建发言记录

```http
POST /speeches
Content-Type: application/json

{
  "sessionId": "session-1",
  "speakerId": "speaker-1",
  "content": "大家好，今天我们讨论项目进度。",
  "confidence": 0.95,
  "startTime": "2025-01-10T10:00:00.000Z",
  "endTime": "2025-01-10T10:00:05.000Z",
  "duration": 5000
}
```

### 批量创建发言记录

```http
POST /speeches/batch
Content-Type: application/json

{
  "speeches": [
    { "sessionId": "session-1", "content": "发言1" },
    { "sessionId": "session-1", "content": "发言2" }
  ]
}
```

### 获取会话的所有发言

```http
GET /speeches/session/:sessionId
```

### 获取发言者的所有发言

```http
GET /speeches/session/:sessionId/speaker/:speakerId
```

### 搜索发言记录

```http
GET /speeches/session/:sessionId/search?keyword=项目
```

### 更新发言

```http
PUT /speeches/:id
Content-Type: application/json

{
  "content": "修改后的内容",
  "isEdited": true
}
```

### 标记/取消标记发言

```http
PUT /speeches/:id/mark
Content-Type: application/json

{
  "marked": true,
  "reason": "重要内容"
}
```

### 删除会话的所有发言

```http
DELETE /speeches/session/:sessionId
```

---

## AI 分析 API

### 生成 AI 分析

```http
POST /analysis/generate
Content-Type: application/json

{
  "sessionId": "session-1",
  "speechIds": ["speech-1", "speech-2"],
  "analysisType": "summary",
  "model": "glm"
}
```

**分析类型**:
- `summary` - 会议摘要
- `action-items` - 行动项
- `sentiment` - 情感分析
- `keywords` - 关键词提取
- `topics` - 议题分析
- `full-report` - 完整报告

**支持的模型**:
- `qianwen` - 千问
- `doubao` - 豆包
- `glm` - 智谱 GLM（当前配置：glm-4.6v-flash）
- `glm-4.6v-flash` - 智谱 GLM-4.6V-Flash（兼容别名）

**响应**:
```json
{
  "data": {
    "id": "analysis-1",
    "sessionId": "session-1",
    "analysisType": "summary",
    "modelUsed": "glm",
    "result": "## 会议摘要\n\n今天讨论了项目进度...",
    "status": "completed",
    "processingTime": 1500,
    "generatedAt": "2025-01-10T10:05:00.000Z",
    "createdAt": "2025-01-10T10:05:00.000Z"
  }
}
```

### 获取或创建分析（带缓存）

```http
POST /analysis/get-or-create
Content-Type: application/json

{
  "sessionId": "session-1",
  "speechIds": ["speech-1", "speech-2"],
  "analysisType": "summary",
  "model": "qianwen"
}
```

如果存在相同参数的缓存分析，直接返回缓存结果。

### 获取分析详情

```http
GET /analysis/:id
```

### 获取会话的所有分析

```http
GET /analysis/session/:sessionId
```

### 获取会话的特定类型分析

```http
GET /analysis/session/:sessionId/type/:analysisType
```

### 删除会话的所有分析

```http
DELETE /analysis/session/:sessionId
```

---

## WebSocket 接口

### 连接

```
ws://localhost:5181/transcript
```

### 客户端 → 服务器消息

#### 开始转写

```json
{
  "event": "start",
  "data": {
    "sessionId": "session-1",
    "language": "zh-CN",
    "model": "doubao"
  }
}
```

#### 发送音频数据

```
Binary: ArrayBuffer (PCM16, 16kHz, mono)
```

#### 停止转写

```json
{
  "event": "stop",
  "data": {}
}
```

### 服务器 → 客户端消息

#### 转写结果

```json
{
  "event": "transcript",
  "data": {
    "sessionId": "session-1",
    "content": "大家好",
    "speakerId": "speaker-1",
    "speakerName": "张三",
    "isFinal": true,
    "confidence": 0.95,
    "timestamp": 1641800000000
  }
}
```

#### 错误消息

```json
{
  "event": "error",
  "data": {
    "message": "转写服务错误"
  }
}
```

#### 连接状态

```json
{
  "event": "status",
  "data": {
    "state": "connected",
    "sessionId": "session-1"
  }
}
```

---

## 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

**相关文档**：
- [后端架构](./architecture.md)
- [WebSocket 协议](./websocket.md)
- [数据模型](./data-models.md)
