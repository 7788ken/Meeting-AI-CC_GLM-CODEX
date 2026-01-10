import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import * as http from 'http'
import * as WebSocket from 'ws'
import { TranscriptService } from './modules/transcript/transcript.service'
import { randomBytes } from 'crypto'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  })

  const configService = app.get(ConfigService)

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter())

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )

  // CORS配置
  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || '*',
    credentials: true,
  })

  // 全局路由前缀
  app.setGlobalPrefix(configService.get('API_PREFIX') || 'api')

  // Swagger API文档
  const config = new DocumentBuilder()
    .setTitle('AI会议助手 API')
    .setDescription('提供实时语音转写和AI分析功能')
    .setVersion('1.0')
    .addTag('sessions', '会话管理')
    .addTag('speeches', '发言记录')
    .addTag('analysis', 'AI分析')
    .addTag('transcript', '实时转写')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  const port = process.env.PORT ? Number(process.env.PORT) : 8000

  // 获取底层 HTTP 服务器
  const server = http.createServer()
  const nestApp = await app.init()

  // 将 NestJS 应用挂载到 HTTP 服务器
  server.on('request', nestApp.getHttpAdapter().getInstance())

  // 创建原生 WebSocket 服务器
  const wss = new WebSocket.Server({ noServer: true, path: '/transcript' })

  // 处理 WebSocket 升级请求
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/transcript') {
      wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request)
      })
    }
  })

  // 获取 TranscriptService 用于处理音频数据
  const transcriptService = app.get(TranscriptService)

  // WebSocket 连接管理
  const clientSessions = new Map<WebSocket, string>()
  const clientIds = new WeakMap<WebSocket, string>()

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Client connected')
    clientIds.set(ws, createClientId())

    ws.on('message', async (data: Buffer) => {
      try {
        // 尝试解析为 JSON 控制消息
        const message = JSON.parse(data.toString())
        console.log('[WebSocket] Received control message:', message.type)

        switch (message.type) {
          case 'set_session':
            clientSessions.set(ws, message.sessionId)
            ws.send(
              JSON.stringify({
                type: 'status',
                data: { sessionId: message.sessionId, status: 'session_set' },
              })
            )
            break

          case 'start_transcribe':
            ws.send(
              JSON.stringify({
                type: 'status',
                data: { status: 'transcribe_started' },
              })
            )
            break

          case 'stop_transcribe':
            const clientId = getClientId(ws)
            if (clientId) {
              await transcriptService.endAudio(clientId)
            }
            ws.send(
              JSON.stringify({
                type: 'status',
                data: { status: 'transcribe_stopped' },
              })
            )
            break
        }
      } catch {
        // 不是 JSON，处理为二进制音频数据
        const sessionId = clientSessions.get(ws)
        const clientId = getClientId(ws)

        if (sessionId && clientId) {
          try {
            const result = await transcriptService.processBinaryAudio(
              clientId,
              data as Buffer,
              sessionId
            )

            if (result) {
              ws.send(
                JSON.stringify({
                  type: 'transcript',
                  data: {
                    sessionId: result.sessionId,
                    content: result.content,
                    speakerId: result.speakerId,
                    speakerName: result.speakerName,
                    confidence: result.confidence,
                    isFinal: result.isFinal,
                    timestamp: Date.now(),
                  },
                })
              )
            }
          } catch (error) {
            console.error('[WebSocket] Error processing audio:', error)
            ws.send(
              JSON.stringify({
                type: 'error',
                data: { error: error instanceof Error ? error.message : 'Unknown error' },
              })
            )
          }
        }
      }
    })

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected')
      const clientId = clientIds.get(ws)
      if (clientId) {
        transcriptService.removeClient(clientId)
      }
      clientSessions.delete(ws)
      clientIds.delete(ws)
    })

    ws.on('error', error => {
      console.error('[WebSocket] Error:', error)
    })
  })

  // 生成客户端 ID
  function getClientId(ws: WebSocket): string {
    const existing = clientIds.get(ws)
    if (existing) return existing

    const created = createClientId()
    clientIds.set(ws, created)
    return created
  }

  function createClientId(): string {
    return randomBytes(8).toString('hex')
  }

  // 启动服务器
  server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${port}`)
    console.log(`📡 WebSocket server running on ws://0.0.0.0:${port}/transcript`)
    console.log(`📚 API Documentation: http://localhost:${port}/api/docs`)
  })
}

bootstrap()
