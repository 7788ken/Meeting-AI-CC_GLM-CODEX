# AI会议助手API接口规范文档

## 1. 文档概述

### 1.1 文档目的
本文档详细描述AI会议助手的API接口规范，包括接口URL、请求方法、请求参数、响应格式、错误码等，为前后端开发团队提供明确的API设计依据，确保API设计合理、易用、可扩展。

### 1.2 术语定义
| 术语 | 解释 |
|------|------|
| RESTful | 一种软件架构风格，用于设计网络应用程序 |
| API | 应用程序编程接口，用于不同软件之间的交互 |
| HTTP | 超文本传输协议，用于传输数据 |
| JWT | JSON Web Token，用于身份认证 |
| UUID | 通用唯一识别码，用于标识资源 |
| ObjectId | MongoDB中的文档唯一标识符 |

## 2. API基本信息

### 2.1 API版本
- 当前版本：v1
- 版本控制：通过URL路径中的版本号控制（如 `/api/v1/sessions`）

### 2.2 基础URL
- 开发环境：`http://localhost:3000/api/v1`
- 测试环境：`https://test-api.example.com/api/v1`
- 生产环境：`https://api.example.com/api/v1`

### 2.3 认证方式
- 采用JWT认证
- 请求头中携带 `Authorization: Bearer <token>`
- 部分公开接口不需要认证

### 2.4 数据格式
- 请求数据格式：JSON
- 响应数据格式：JSON
- 字符编码：UTF-8

### 2.5 响应状态码
| 状态码 | 描述 |
|--------|------|
| 200 | 请求成功 |
| 201 | 资源创建成功 |
| 204 | 资源删除成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
| 502 | 网关错误 |
| 503 | 服务不可用 |
| 504 | 网关超时 |

### 2.6 错误响应格式
```json
{
  "code": "ERROR_CODE",
  "message": "错误描述",
  "details": "详细错误信息（可选）"
}
```

## 3. 会话管理API

### 3.1 创建会话

**功能描述**：创建一个新的会议会话

**请求信息**：
- **URL**：`/sessions`
- **方法**：`POST`
- **认证**：需要
- **请求体**：
```json
{
  "name": "会话名称",
  "recording_quality": "medium",
  "transcription_language": "zh-CN"
}
```

**响应信息**：
- **状态码**：`201 Created`
- **响应体**：
```json
{
  "id": "uuid",
  "name": "会话名称",
  "status": "active",
  "created_at": "2026-01-09T00:00:00Z",
  "recording_quality": "medium",
  "transcription_language": "zh-CN"
}
```

### 3.2 获取会话列表

**功能描述**：获取会话列表

**请求信息**：
- **URL**：`/sessions`
- **方法**：`GET`
- **认证**：需要
- **查询参数**：
  - `page`：页码，默认1
  - `page_size`：每页条数，默认20
  - `status`：会话状态（active, ended）
  - `keyword`：搜索关键词
  - `sort_by`：排序字段，默认created_at
  - `sort_order`：排序顺序，asc或desc，默认desc

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "total": 100,
  "page": 1,
  "page_size": 20,
  "data": [
    {
      "id": "uuid",
      "name": "会话名称",
      "status": "ended",
      "created_at": "2026-01-09T00:00:00Z",

      "ended_at": "2026-01-09T10:00:00Z",
      "duration": 3600
    },
    // 更多会议...
  ]
}
```

### 3.3 获取会话详情

**功能描述**：获取单个会议的详细信息

**请求信息**：
- **URL**：`/sessions/{id}`
- **方法**：`GET`
- **认证**：需要
- **路径参数**：
  - `id`：会话ID（UUID）

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "id": "uuid",
  "name": "会议名称",
  "description": "会议描述",
  "status": "ended",
  "created_at": "2026-01-09T00:00:00Z",
  "started_at": "2026-01-09T09:00:00Z",
  "ended_at": "2026-01-09T10:00:00Z",
  "duration": 3600,
  "recording_quality": "medium",
  "transcription_language": "zh-CN",
  "speakers_count": 5,
  "speeches_count": 20
}
```

### 3.4 结束会话

**功能描述**：结束会议

**请求信息**：
- **URL**：`/sessions/{id}/end`
- **方法**：`POST`
- **认证**：需要
- **路径参数**：
  - `id`：会话ID（UUID）

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "id": "uuid",
  "status": "ended",
  "ended_at": "2026-01-09T10:00:00Z",
  "duration": 3600
}
```

## 4. 发言者管理API

### 4.1 创建发言者

**功能描述**：创建一个新的发言者

**请求信息**：
- **URL**：`/sessions/{session_id}/speakers`
- **方法**：`POST`
- **认证**：需要
- **路径参数**：
  - `session_id`：会话ID（UUID）
- **请求体**：
```json
{
  "name": "发言者名称",
  "color": "#1890ff"
}
```

**响应信息**：
- **状态码**：`201 Created`
- **响应体**：
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "name": "发言者名称",
  "color": "#1890ff",
  "is_default": false,
  "created_at": "2026-01-09T00:00:00Z"
}
```

### 4.2 获取发言者列表

**功能描述**：获取会议的发言者列表

**请求信息**：
- **URL**：`/sessions/{session_id}/speakers`
- **方法**：`GET`
- **认证**：需要
- **路径参数**：
  - `session_id`：会话ID（UUID）

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
[
  {
    "id": "uuid",
    "session_id": "uuid",
    "name": "发言者1",
    "color": "#1890ff",
    "is_default": false,
    "created_at": "2026-01-09T00:00:00Z"
  },
  {
    "id": "uuid",
    "session_id": "uuid",
    "name": "发言者2",
    "color": "#52c41a",
    "is_default": true,
    "created_at": "2026-01-09T00:00:00Z"
  }
]
```

### 4.3 更新发言者

**功能描述**：更新发言者信息

**请求信息**：
- **URL**：`/speakers/{id}`
- **方法**：`PUT`
- **认证**：需要
- **路径参数**：
  - `id`：发言者ID（UUID）
- **请求体**：
```json
{
  "name": "新发言者名称",
  "color": "#ff4d4f"
}
```

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "name": "新发言者名称",
  "color": "#ff4d4f",
  "is_default": false,
  "created_at": "2026-01-09T00:00:00Z"
}
```

### 4.4 删除发言者

**功能描述**：删除发言者

**请求信息**：
- **URL**：`/speakers/{id}`
- **方法**：`DELETE`
- **认证**：需要
- **路径参数**：
  - `id`：发言者ID（UUID）

**响应信息**：
- **状态码**：`204 No Content`

## 5. 发言记录管理API

### 5.1 创建发言记录

**功能描述**：创建一个新的发言记录

**请求信息**：
- **URL**：`/sessions/{session_id}/speeches`
- **方法**：`POST`
- **认证**：需要
- **路径参数**：
  - `session_id`：会话ID（UUID）
- **请求体**：
```json
{
  "speaker_id": "uuid",
  "content": "发言内容",
  "start_time": "2026-01-09T09:00:00Z",
  "end_time": "2026-01-09T09:05:00Z",
  "confidence": 0.95,
  "audio_url": "https://example.com/audio.mp3",
  "metadata": {
    "transcription_service": "doubao",
    "language": "zh-CN",
    "channel": 1
  }
}
```

**响应信息**：
- **状态码**：`201 Created`
- **响应体**：
```json
{
  "_id": "objectid",
  "session_id": "uuid",
  "speaker_id": "uuid",
  "speaker_name": "发言者名称",
  "content": "发言内容",
  "start_time": "2026-01-09T09:00:00Z",
  "end_time": "2026-01-09T09:05:00Z",
  "duration": 300,
  "confidence": 0.95,
  "is_edited": false,
  "created_at": "2026-01-09T09:05:00Z",
  "audio_url": "https://example.com/audio.mp3",
  "metadata": {
    "transcription_service": "doubao",
    "language": "zh-CN",
    "channel": 1
  }
}
```

### 5.2 获取发言记录列表

**功能描述**：获取会议的发言记录列表

**请求信息**：
- **URL**：`/sessions/{session_id}/speeches`
- **方法**：`GET`
- **认证**：需要
- **路径参数**：
  - `session_id`：会话ID（UUID）
- **查询参数**：
  - `page`：页码，默认1
  - `page_size`：每页条数，默认20
  - `speaker_id`：发言者ID，用于筛选
  - `keyword`：搜索关键词
  - `sort_by`：排序字段，默认start_time
  - `sort_order`：排序顺序，asc或desc，默认asc

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "total": 100,
  "page": 1,
  "page_size": 20,
  "data": [
    {
      "_id": "objectid",
      "session_id": "uuid",
      "speaker_id": "uuid",
      "speaker_name": "发言者名称",
      "content": "发言内容预览...",
      "start_time": "2026-01-09T09:00:00Z",
      "end_time": "2026-01-09T09:05:00Z",
      "duration": 300,
      "confidence": 0.95
    },
    // 更多发言记录...
  ]
}
```

### 5.3 获取发言记录详情

**功能描述**：获取单个发言记录的详细信息

**请求信息**：
- **URL**：`/speeches/{id}`
- **方法**：`GET`
- **认证**：需要
- **路径参数**：
  - `id`：发言记录ID（ObjectId）

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "_id": "objectid",
  "session_id": "uuid",
  "speaker_id": "uuid",
  "speaker_name": "发言者名称",
  "content": "完整的发言内容",
  "start_time": "2026-01-09T09:00:00Z",
  "end_time": "2026-01-09T09:05:00Z",
  "duration": 300,
  "confidence": 0.95,
  "is_edited": false,
  "created_at": "2026-01-09T09:05:00Z",
  "audio_url": "https://example.com/audio.mp3",
  "metadata": {
    "transcription_service": "doubao",
    "language": "zh-CN",
    "channel": 1
  }
}
```

### 5.4 更新发言记录

**功能描述**：更新发言记录

**请求信息**：
- **URL**：`/speeches/{id}`
- **方法**：`PUT`
- **认证**：需要
- **路径参数**：
  - `id`：发言记录ID（ObjectId）
- **请求体**：
```json
{
  "speaker_id": "uuid",
  "content": "修改后的发言内容"
}
```

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "_id": "objectid",
  "session_id": "uuid",
  "speaker_id": "uuid",
  "speaker_name": "发言者名称",
  "content": "修改后的发言内容",
  "start_time": "2026-01-09T09:00:00Z",
  "end_time": "2026-01-09T09:05:00Z",
  "duration": 300,
  "confidence": 0.95,
  "is_edited": true,
  "edited_at": "2026-01-09T10:00:00Z",
  "created_at": "2026-01-09T09:05:00Z",
  "audio_url": "https://example.com/audio.mp3",
  "metadata": {
    "transcription_service": "doubao",
    "language": "zh-CN",
    "channel": 1
  }
}
```

### 5.5 删除发言记录

**功能描述**：删除发言记录

**请求信息**：
- **URL**：`/speeches/{id}`
- **方法**：`DELETE`
- **认证**：需要
- **路径参数**：
  - `id`：发言记录ID（ObjectId）

**响应信息**：
- **状态码**：`204 No Content`

### 5.6 搜索发言记录

**功能描述**：按关键词搜索发言记录

**请求信息**：
- **URL**：`/sessions/{session_id}/speeches/search`
- **方法**：`GET`
- **认证**：需要
- **路径参数**：
  - `session_id`：会话ID（UUID）
- **查询参数**：
  - `keyword`：搜索关键词（必填）
  - `page`：页码，默认1
  - `page_size`：每页条数，默认20

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "total": 10,
  "page": 1,
  "page_size": 20,
  "data": [
    {
      "_id": "objectid",
      "session_id": "uuid",
      "speaker_id": "uuid",
      "speaker_name": "发言者名称",
      "content": "包含关键词的发言内容...",
      "start_time": "2026-01-09T09:00:00Z",
      "end_time": "2026-01-09T09:05:00Z",
      "duration": 300,
      "confidence": 0.95
    },
    // 更多搜索结果...
  ]
}
```

## 6. AI分析管理API

### 6.1 生成AI分析

**功能描述**：生成发言记录的AI分析

**请求信息**：
- **URL**：`/speeches/{id}/analyze`
- **方法**：`POST`
- **认证**：需要
- **路径参数**：
  - `id`：发言记录ID（ObjectId）
- **请求体**：
```json
{
  "model_name": "glm-4",
  "prompt": "请分析以下发言内容的核心要点："
}
```

**响应信息**：
- **状态码**：`201 Created`
- **响应体**：
```json
{
  "_id": "objectid",
  "speech_id": "objectid",
  "session_id": "uuid",
  "model_name": "glm-4",
  "core_analysis": "核心要点分析",
  "brief_answer": "简要回答",
  "deep_answer": "深度回答",
  "prompt": "请分析以下发言内容的核心要点：",
  "tokens_used": 100,
  "generated_at": "2026-01-09T10:00:00Z",
  "confidence": 0.9
}
```

### 6.2 获取AI分析列表

**功能描述**：获取发言记录的AI分析列表

**请求信息**：
- **URL**：`/speeches/{id}/analyses`
- **方法**：`GET`
- **认证**：需要
- **路径参数**：
  - `id`：发言记录ID（ObjectId）

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
[
  {
    "_id": "objectid",
    "speech_id": "objectid",
    "session_id": "uuid",
    "model_name": "glm-4",
    "core_analysis": "核心要点分析",
    "brief_answer": "简要回答",
    "deep_answer": "深度回答",
    "generated_at": "2026-01-09T10:00:00Z",
    "confidence": 0.9
  },
  {
    "_id": "objectid",
    "speech_id": "objectid",
    "session_id": "uuid",
    "model_name": "minimax",
    "core_analysis": "核心要点分析",
    "brief_answer": "简要回答",
    "deep_answer": "深度回答",
    "generated_at": "2026-01-09T10:05:00Z",
    "confidence": 0.85
  }
]
```

### 6.3 获取AI分析详情

**功能描述**：获取单个AI分析的详细信息

**请求信息**：
- **URL**：`/analyses/{id}`
- **方法**：`GET`
- **认证**：需要
- **路径参数**：
  - `id`：AI分析ID（ObjectId）

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "_id": "objectid",
  "speech_id": "objectid",
  "session_id": "uuid",
  "model_name": "glm-4",
  "core_analysis": "核心要点分析",
  "brief_answer": "简要回答",
  "deep_answer": "深度回答",
  "prompt": "请分析以下发言内容的核心要点：",
  "tokens_used": 100,
  "generated_at": "2026-01-09T10:00:00Z",
  "confidence": 0.9,
  "metadata": {
    "api_version": "v1",
    "response_time": 2000
  }
}
```

### 6.4 获取支持的AI模型列表

**功能描述**：获取系统支持的AI模型列表

**请求信息**：
- **URL**：`/ai/models`
- **方法**：`GET`
- **认证**：需要

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
[
  {
    "name": "qianwen",
    "display_name": "字节跳动千问",
    "description": "字节跳动推出的大语言模型",
    "is_default": true,
    "cost_per_1k_tokens": 0.15
  },
  {
    "name": "doubao",
    "display_name": "豆包",
    "description": "字节跳动推出的大语言模型",
    "is_default": false,
    "cost_per_1k_tokens": 0.2
  },
  {
    "name": "glm-4",
    "display_name": "智谱GLM-4",
    "description": "智谱AI推出的大语言模型",
    "is_default": false,
    "cost_per_1k_tokens": 0.2
  },
  {
    "name": "minimax",
    "display_name": "MINIMAX",
    "description": "MINIMAX推出的大语言模型",
    "is_default": false,
    "cost_per_1k_tokens": 0.3
  },
  {
    "name": "kimi",
    "display_name": "KIMI",
    "description": "月之暗面推出的大语言模型",
    "is_default": false,
    "cost_per_1k_tokens": 0.4
  },
  {
    "name": "dc",
    "display_name": "深度求索",
    "description": "深度求索推出的大语言模型",
    "is_default": false,
    "cost_per_1k_tokens": 0.5
  }
]
```

## 7. 语音处理API

### 7.1 语音转写

**功能描述**：将语音文件转换为文字

**请求信息**：
- **URL**：`/speech-to-text`
- **方法**：`POST`
- **认证**：需要
- **请求体**：
```json
{
  "audio_url": "https://example.com/audio.mp3",
  "language": "zh-CN",
  "service": "doubao"
}
```

**响应信息**：
- **状态码**：`200 OK`
- **响应体**：
```json
{
  "text": "转写结果",
  "confidence": 0.95,
  "segments": [
    {
      "text": "段落1",
      "start_time": 0,
      "end_time": 5000,
      "confidence": 0.96
    },
    {
      "text": "段落2",
      "start_time": 5000,
      "end_time": 10000,
      "confidence": 0.94
    }
  ]
}
```

## 8. 错误码定义

| 错误码 | 描述 | HTTP状态码 |
|--------|------|------------|
| INVALID_REQUEST | 请求参数错误 | 400 |
| UNAUTHORIZED | 未授权 | 401 |
| FORBIDDEN | 禁止访问 | 403 |
| RESOURCE_NOT_FOUND | 资源不存在 | 404 |
| METHOD_NOT_ALLOWED | 方法不允许 | 405 |
| INTERNAL_SERVER_ERROR | 服务器内部错误 | 500 |
| SERVICE_UNAVAILABLE | 服务不可用 | 503 |
| AI_MODEL_ERROR | AI模型错误 | 500 |
| SPEECH_RECOGNITION_ERROR | 语音识别错误 | 500 |

## 9. 附录

### 9.1 参考文档
- AI会议助手功能需求说明书
- 系统架构设计文档
- 数据模型设计文档

### 9.2 版本历史
| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| V1.0 | 2026-01-09 | AI助手 | 初始版本 |
