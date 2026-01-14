# 后端架构

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| NestJS | 10.x | Node.js 后端框架 |
| TypeScript | 5.3+ | 类型安全 |
| Prisma | 5.x | PostgreSQL ORM |
| Mongoose | 8.x | MongoDB ODM |
| WebSocket | 1.x | 实时通信 |
| Jest | 29.x | 单元测试 |

## 目录结构

```
backend/src/
├── modules/             # 业务模块
│   ├── analysis/        # AI 分析模块 (B1022-B1026)
│   │   ├── clients/
│   │   │   └── glm.client.ts       # GLM AI 客户端 (B1023)
│   │   ├── dto/
│   │   │   ├── analysis.dto.ts
│   │   │   └── analysis.enum.ts
│   │   ├── schemas/
│   │   │   └── analysis.schema.ts   # Mongoose Schema (B1011)
│   │   ├── analysis.controller.ts   # 分析控制器 (B1022)
│   │   ├── analysis.service.ts      # 分析服务 (B1026)
│   │   └── analysis.module.ts
│   │
│   ├── session/         # 会话管理模块 (B1012-B1015)
│   │   ├── dto/
│   │   │   └── session.dto.ts
│   │   ├── session.controller.ts    # 会话控制器 (B1012-B1014)
│   │   ├── session.service.ts       # 会话服务 (B1015)
│   │   └── session.module.ts
│   │
│   ├── speech/          # 发言记录模块 (B1020, B1027-B1030)
│   │   ├── dto/
│   │   │   └── speech.dto.ts
│   │   ├── schemas/
│   │   │   └── speech.schema.ts     # Mongoose Schema (B1010)
│   │   ├── speaker.service.ts       # 发言者服务 (B1020)
│   │   ├── speech.controller.ts     # 发言控制器 (B1027-B1030)
│   │   ├── speech.service.ts
│   │   └── speech.module.ts
│   │
│   └── transcript/      # 转写服务模块 (B1016-B1019)
│       ├── dto/
│       │   └── transcript.dto.ts
│       ├── glm-asr.client.ts        # GLM ASR 客户端
│       ├── smart-audio-buffer.service.ts # 智能音频缓冲
│       ├── transcript.gateway.ts    # WebSocket 网关 (B1016)
│       ├── transcript.service.ts    # 转写服务 (B1017)
│       └── transcript.module.ts
│
├── database/            # 数据库配置
│   ├── prisma.module.ts         # Prisma 模块 (B1006)
│   ├── prisma.service.ts        # Prisma 服务
│   ├── mongodb.module.ts        # MongoDB 模块 (B1009)
│   └── mongodb.ts               # MongoDB 连接
│
├── config/              # 配置管理
│   ├── configuration.ts
│   └── configuration.service.ts
│
├── common/              # 公共模块
│   └── filters/
│       └── all-exceptions.filter.ts  # 全局异常过滤 (B1002)
│
├── app.module.ts        # 根模块 (B1001)
├── main.ts              # 应用入口 (B1001)
└── prisma/              # Prisma Schema
    └── schema.prisma    # 数据模型定义 (B1007, B1008)
```

## 核心架构模式

### 1. 模块化架构 (Modular Architecture)

每个业务功能是一个独立的 NestJS 模块：

```typescript
@Module({
  imports: [MongooseModule.forFeature([{ name: 'Analysis', schema: AnalysisSchema }])],
  controllers: [AnalysisController],
  providers: [AnalysisService, GLMClient],
  exports: [AnalysisService],
})
export class AnalysisModule {}
```

### 2. 依赖注入 (Dependency Injection)

服务通过构造函数注入依赖：

```typescript
@Injectable()
export class AnalysisService {
  constructor(
    @InjectModel('Analysis') private analysisModel: Model<Analysis>,
    private glmClient: GlmClient,
  ) {}

  async generate(request: AnalysisRequest): Promise<AIAnalysis> {
    return this.glmClient.generateAnalysis(request)
  }
}
```

### 3. WebSocket 网关

实时通信使用 WebSocket Gateway：

```typescript
@WebSocketGateway({
  cors: { origin: '*' },
  path: '/ws/transcript',
})
export class TranscriptGateway {
  @SubscribeMessage('audio:start')
  handleAudioStart(client: Socket, payload: StartPayload) {
    // 开始处理音频流
  }

  @SubscribeMessage('audio:data')
  handleAudioData(client: Socket, payload: ArrayBuffer) {
    // 处理音频数据
  }
}
```

## 数据存储

### PostgreSQL (Prisma)

存储结构化数据：会话、发言者等

```prisma
// prisma/schema.prisma
model Session {
  id          String   @id @default(uuid())
  title       String?
  description String?
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  duration    Int?
  isActive    Boolean  @default(true)
  speakers    Speaker[]
}

model Speaker {
  id        String   @id @default(uuid())
  sessionId String
  name      String
  color     String
  session   Session  @relation(fields: [sessionId], references: [id])
}
```

### MongoDB (Mongoose)

存储文档数据：发言记录、AI 分析结果等

```typescript
// speech.schema.ts
export const SpeechSchema = SchemaFactory.createForClass(Speech)
@Schema({ _id: false })
export class Speech {
  @Prop() id: string
  @Prop() sessionId: string
  @Prop() speakerId: string
  @Prop() content: string
  @Prop() confidence: number
  @Prop() isMarked: boolean
}
```

## API 设计

### RESTful API

```
POST   /sessions                    # 创建会话
GET    /sessions                    # 获取会话列表
GET    /sessions/:id                # 获取会话详情
PUT    /sessions/:id/end            # 结束会话

POST   /speeches                    # 创建发言记录
GET    /speeches/session/:id        # 获取会话的所有发言
PUT    /speeches/:id                # 更新发言记录

POST   /analysis/generate           # 生成 AI 分析
POST   /analysis/get-or-create      # 获取或缓存分析
GET    /analysis/session/:id        # 获取会话的所有分析
```

### WebSocket 协议

```
客户端 → 服务器:
  audio:start    { sessionId, language }
  audio:data     ArrayBuffer (PCM16)
  audio:end      {}

服务器 → 客户端:
  transcript:data { content, speakerId, isFinal, confidence }
  error          { message }
```

## 外部服务集成

### GLM ASR (语音识别)

- 二进制协议通信
- 流式音频处理
- 实时转写返回

### GLM AI (文本分析)

- HTTP API 调用
- Prompt 模板管理
- 结果缓存机制


## 错误处理

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR

    const message = exception instanceof HttpException
      ? exception.message
      : 'Internal server error'

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    })
  }
}
```

## 数据验证

使用 class-validator 进行 DTO 验证：

```typescript
export class CreateSessionDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string
}
```

## 测试策略

```typescript
// 单元测试
describe('AnalysisService', () => {
  it('should generate analysis result', async () => {
    const result = await service.generate({ sessionId: '1', speechIds: [] })
    expect(result).toBeDefined()
  })
})
```

---

**相关文档**：
- [API 接口](./api.md)
- [数据模型](./data-models.md)
- [WebSocket 协议](./websocket.md)
