import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import * as http from 'http'
import * as WebSocket from 'ws'
import { TranscriptService } from './modules/transcript/transcript.service'
import { randomBytes } from 'crypto'
import { SpeechService } from './modules/speech/speech.service'
import { SpeakerService } from './modules/speech/speaker.service'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  })

  const configService = app.get(ConfigService)
  const logger = new Logger('Bootstrap')

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
  const speechService = app.get(SpeechService)
  const speakerService = app.get(SpeakerService)

  // WebSocket Logger
  const wsLogger = new Logger('WebSocket')

  // WebSocket 连接管理
  const clientSessions = new Map<WebSocket, string>()
  // 使用 Map 代替 WeakMap，确保 clientId 在连接期间保持稳定
  const clientIds = new Map<WebSocket, string>()
  const audioStarted = new WeakSet<WebSocket>()

  const sessionClients = new Map<string, Set<WebSocket>>()
  const activeSpeechByClientId = new Map<
    string,
    {
      sessionId: string
      speechId: string
      speakerId: string
      segmentKey?: string
      lastContent: string
      lastUpdateAtMs: number
    }
  >()

  const speakerMetaBySessionClient = new Map<string, { speakerId: string; speakerName: string }>()
  const speakerNameBySessionSpeakerId = new Map<string, string>()
  const speakerIndexBySession = new Map<string, number>()

  wss.on('connection', (ws: WebSocket) => {
    const clientId = createClientId()
    clientIds.set(ws, clientId)
    wsLogger.log(`Client connected, clientId: ${clientId}`)

    ws.on('message', async (data: Buffer) => {
      try {
        // 尝试解析为 JSON 控制消息
        const message = JSON.parse(data.toString())
        wsLogger.debug(`Received control message: ${message.type}`)

        switch (message.type) {
          case 'set_session':
            {
              const nextSessionId = String(message.sessionId || '')
              if (!nextSessionId) {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    data: { error: 'sessionId 不能为空' },
                  })
                )
                break
              }

              const previousSessionId = clientSessions.get(ws)
              if (previousSessionId && previousSessionId !== nextSessionId) {
                removeClientFromSession(previousSessionId, ws)
              }

              clientSessions.set(ws, nextSessionId)
              addClientToSession(nextSessionId, ws)

              const ensured = ensureSpeakerMeta(nextSessionId, clientId)

              ws.send(
                JSON.stringify({
                  type: 'status',
                  data: {
                    sessionId: nextSessionId,
                    status: 'session_set',
                    speakerId: ensured.speakerId,
                    speakerName: ensured.speakerName,
                  },
                })
              )
            }
            break

          case 'set_speaker':
            {
              const sessionId = clientSessions.get(ws)
              if (!sessionId) {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    data: { error: '会话未设置：请先发送 set_session' },
                  })
                )
                break
              }

              const rawSpeakerName = message.speakerName
              const rawSpeakerId = message.speakerId

              const speakerName =
                typeof rawSpeakerName === 'string' && rawSpeakerName.trim().length > 0
                  ? rawSpeakerName.trim()
                  : undefined

              const speakerId =
                typeof rawSpeakerId === 'string' && rawSpeakerId.trim().length > 0
                  ? rawSpeakerId.trim()
                  : undefined

              if (!speakerName && !speakerId) {
                ws.send(
                  JSON.stringify({
                    type: 'error',
                    data: { error: 'speakerName 或 speakerId 至少需要提供一个' },
                  })
                )
                break
              }

              const current = ensureSpeakerMeta(sessionId, clientId)
              const next = {
                speakerId: speakerId ?? current.speakerId,
                speakerName: speakerName ?? current.speakerName,
              }
              speakerMetaBySessionClient.set(getSpeakerMetaKey(sessionId, clientId), next)
              speakerNameBySessionSpeakerId.set(getSpeakerDirectoryKey(sessionId, next.speakerId), next.speakerName)

              ws.send(
                JSON.stringify({
                  type: 'status',
                  data: { status: 'speaker_set', ...next },
                })
              )
            }
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
            {
              const clientId = getClientId(ws)
              if (clientId) {
                const sessionId = clientSessions.get(ws)
                if (sessionId) {
                  const result = await transcriptService.finalizeAudio(clientId, sessionId, {
                    propagateError: true,
                  })
                  if (result) {
                    await persistAndBroadcastTranscript(sessionId, clientId, {
                      content: result.content,
                      confidence: result.confidence,
                      isFinal: true,
                      speakerId: result.speakerId,
                      speakerName: result.speakerName,
                      segmentKey: result.segmentKey,
                    })
                  } else {
                    // 没有返回转写结果，也要关闭当前活跃段落，避免前端一直认为该段落未结束
                    await finalizeActiveSpeechForClient(clientId)
                  }
                } else {
                  await transcriptService.endAudio(clientId)
                }
              }
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

        if (!sessionId) {
          ws.send(
            JSON.stringify({
              type: 'error',
              data: { error: '会话未设置：请先发送 set_session 再发送音频数据' },
            })
          )
          return
        }

        if (!clientId) {
          ws.send(
            JSON.stringify({
              type: 'error',
              data: { error: '客户端未初始化：请重新连接后再试' },
            })
          )
          return
        }

        try {
          if (!audioStarted.has(ws)) {
            audioStarted.add(ws)
            wsLogger.log(`Audio streaming started, clientId=${clientId}, sessionId=${sessionId}`)
            ws.send(
              JSON.stringify({
                type: 'status',
                data: { status: 'audio_started' },
              })
            )
          }

          const result = await transcriptService.processBinaryAudio(
            clientId,
            data as Buffer,
            sessionId,
            { propagateError: true }
          )

          if (result) {
            await persistAndBroadcastTranscript(sessionId, clientId, {
              content: result.content,
              confidence: result.confidence,
              isFinal: result.isFinal,
              speakerId: result.speakerId,
              speakerName: result.speakerName,
              segmentKey: result.segmentKey,
            })
          }
        } catch (error) {
          wsLogger.error(`Error processing audio: ${error}`)
          ws.send(
            JSON.stringify({
              type: 'error',
              data: { error: error instanceof Error ? error.message : 'Unknown error' },
            })
          )
        }
      }
    })

    ws.on('close', () => {
      const clientId = clientIds.get(ws)
      wsLogger.log(`Client disconnected, clientId: ${clientId}`)
      if (clientId) {
        transcriptService.removeClient(clientId)
        void finalizeActiveSpeechForClient(clientId)
      }
      const sessionId = clientSessions.get(ws)
      if (sessionId) {
        removeClientFromSession(sessionId, ws)
      }
      clientSessions.delete(ws)
      clientIds.delete(ws) // 防止内存泄漏：使用 Map 时必须手动删除
    })

    ws.on('error', error => {
      wsLogger.error(`WebSocket error: ${error.message}`)
    })
  })

  // 获取客户端 ID（不再动态创建，确保会话稳定性）
  function getClientId(ws: WebSocket): string | null {
    return clientIds.get(ws) || null
  }

  function createClientId(): string {
    return randomBytes(8).toString('hex')
  }

  function addClientToSession(sessionId: string, ws: WebSocket): void {
    const set = sessionClients.get(sessionId) ?? new Set<WebSocket>()
    set.add(ws)
    sessionClients.set(sessionId, set)
  }

  function removeClientFromSession(sessionId: string, ws: WebSocket): void {
    const set = sessionClients.get(sessionId)
    if (!set) return
    set.delete(ws)
    if (set.size === 0) {
      sessionClients.delete(sessionId)
    }
  }

  function broadcastToSession(sessionId: string, payload: unknown): void {
    const set = sessionClients.get(sessionId)
    if (!set) return

    const message = JSON.stringify(payload)
    for (const client of set) {
      if (client.readyState !== WebSocket.OPEN) {
        set.delete(client)
        continue
      }
      client.send(message)
    }

    if (set.size === 0) {
      sessionClients.delete(sessionId)
    }
  }

  function getSpeakerMetaKey(sessionId: string, clientId: string): string {
    return `${sessionId}:${clientId}`
  }

  function getSpeakerDirectoryKey(sessionId: string, speakerId: string): string {
    return `${sessionId}:${speakerId}`
  }

  function ensureSpeakerMeta(
    sessionId: string,
    clientId: string
  ): { speakerId: string; speakerName: string } {
    const key = getSpeakerMetaKey(sessionId, clientId)
    const existing = speakerMetaBySessionClient.get(key)
    if (existing) {
      return existing
    }

    const index = speakerIndexBySession.get(sessionId) ?? 0
    speakerIndexBySession.set(sessionId, index + 1)
    const label = toSpeakerLabel(index)

    const meta = {
      speakerId: `client_${clientId}`,
      speakerName: `发言者 ${label}`,
    }

    speakerMetaBySessionClient.set(key, meta)
    speakerNameBySessionSpeakerId.set(getSpeakerDirectoryKey(sessionId, meta.speakerId), meta.speakerName)
    return meta
  }

  function toSpeakerLabel(index: number): string {
    // A, B, ..., Z, AA, AB, ...
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    if (index < 0) return 'A'

    let n = index
    let label = ''
    do {
      label = alphabet[n % 26] + label
      n = Math.floor(n / 26) - 1
    } while (n >= 0)

    return label
  }

  function resolveSpeaker(
    sessionId: string,
    clientId: string,
    asrSpeakerId: string,
    asrSpeakerName: string
  ): { speakerId: string; speakerName: string } {
    const meta = ensureSpeakerMeta(sessionId, clientId)

    const rawSpeakerId = asrSpeakerId?.trim?.() ? asrSpeakerId.trim() : ''
    const rawSpeakerName = asrSpeakerName?.trim?.() ? asrSpeakerName.trim() : ''

    const speakerId = rawSpeakerId && rawSpeakerId !== `client_${clientId}` ? rawSpeakerId : meta.speakerId
    const dirKey = getSpeakerDirectoryKey(sessionId, speakerId)

    const speakerName =
      rawSpeakerName ||
      speakerNameBySessionSpeakerId.get(dirKey) ||
      (speakerId === meta.speakerId ? meta.speakerName : '') ||
      `发言者 ${toSpeakerLabel(nextSpeakerIndex(sessionId))}`

    speakerNameBySessionSpeakerId.set(dirKey, speakerName)

    return { speakerId, speakerName }
  }

  function nextSpeakerIndex(sessionId: string): number {
    const index = speakerIndexBySession.get(sessionId) ?? 0
    speakerIndexBySession.set(sessionId, index + 1)
    return index
  }

  async function finalizeActiveSpeechForClient(clientId: string): Promise<void> {
    const active = activeSpeechByClientId.get(clientId)
    if (!active) return

    const now = new Date()
    try {
      const speech = await speechService.updateRealtime(active.speechId, { endTime: now })
      broadcastToSession(active.sessionId, {
        type: 'transcript',
        data: {
          ...speech,
          isFinal: true,
          timestamp: Date.now(),
        },
      })
    } catch (error) {
      wsLogger.warn(
        `Finalize active speech failed, clientId=${clientId}: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      activeSpeechByClientId.delete(clientId)
    }
  }

  async function persistAndBroadcastTranscript(
    sessionId: string,
    clientId: string,
    input: {
      content: string
      confidence: number
      isFinal: boolean
      speakerId: string
      speakerName: string
      segmentKey?: string
    }
  ): Promise<void> {
    const resolved = resolveSpeaker(sessionId, clientId, input.speakerId, input.speakerName)
    const assigned = speakerService.assignSpeaker(resolved.speakerId, resolved.speakerName)
    const now = new Date()
    const nowMs = Date.now()
    const active = activeSpeechByClientId.get(clientId)

    if (
      active &&
      (active.sessionId !== sessionId ||
        active.speakerId !== assigned.id ||
        (input.segmentKey && active.segmentKey && input.segmentKey !== active.segmentKey) ||
        (active.segmentKey == null &&
          input.segmentKey == null &&
          nowMs - active.lastUpdateAtMs >= getAutoSplitGapMs()) ||
        (active.segmentKey == null &&
          input.segmentKey == null &&
          shouldSplitByContent(active.lastContent, input.content)))
    ) {
      // speaker 或 utterance 边界变化：先结束上一段，避免全部拼成一条
      await finalizeActiveSpeechForClient(clientId)
    }

    const refreshed = activeSpeechByClientId.get(clientId)

    let speech
    if (!refreshed || refreshed.sessionId !== sessionId || refreshed.speakerId !== assigned.id) {
      speech = await speechService.create({
        sessionId,
        speakerId: assigned.id,
        speakerName: assigned.name,
        speakerColor: assigned.color,
        content: input.content,
        confidence: input.confidence,
      })
      activeSpeechByClientId.set(clientId, {
        sessionId,
        speechId: speech.id,
        speakerId: assigned.id,
        segmentKey: input.segmentKey,
        lastContent: input.content,
        lastUpdateAtMs: nowMs,
      })
    } else {
      speech = await speechService.updateRealtime(refreshed.speechId, {
        content: input.content,
        confidence: input.confidence,
        speakerId: assigned.id,
        speakerName: assigned.name,
        speakerColor: assigned.color,
        endTime: now,
      })
      refreshed.segmentKey = input.segmentKey ?? refreshed.segmentKey
      refreshed.lastContent = input.content
      refreshed.lastUpdateAtMs = nowMs
    }

    if (input.isFinal) {
      activeSpeechByClientId.delete(clientId)
    }

    broadcastToSession(sessionId, {
      type: 'transcript',
      data: {
        ...speech,
        isFinal: input.isFinal,
        timestamp: Date.now(),
      },
    })
  }

  function shouldSplitByContent(previous: string, next: string): boolean {
    const prev = previous?.trim?.() ?? ''
    const cur = next?.trim?.() ?? ''
    if (!prev || !cur) return false
    if (prev === cur) return false

    // 常见流式 ASR 会在进入下一句/下一段时“重置文本”，用轻量启发式检测
    if (cur.startsWith(prev) || prev.startsWith(cur)) return false

    // 避免轻微改写触发切段：只有在长度明显回退时才切段
    return cur.length <= Math.max(6, Math.floor(prev.length * 0.6))
  }

  function getAutoSplitGapMs(): number {
    const raw = process.env.TRANSCRIPT_AUTO_SPLIT_GAP_MS
    if (!raw) return 2500
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : 2500
  }

  // 启动服务器
  server.listen(port, '0.0.0.0', () => {
    logger.log(`🚀 Server running on http://0.0.0.0:${port}`)
    logger.log(`📡 WebSocket server running on ws://0.0.0.0:${port}/transcript`)
    logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`)
  })
}

bootstrap()
