import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import * as http from 'http'
import * as WebSocket from 'ws'
import { SmartAudioBufferService } from './modules/transcript/smart-audio-buffer.service'
import { GlmAsrClient } from './modules/transcript/glm-asr.client'
import type { AsrConfigDto } from './modules/transcript/dto/transcript.dto'
import { TranscriptStreamService } from './modules/transcript-stream/transcript-stream.service'
import { DebugErrorService } from './modules/debug-error/debug-error.service'
import {
  TranscriptEventSegmentationService,
  TranscriptEventSegmentDTO,
  TranscriptEventSegmentationProgressDTO,
} from './modules/transcript-event-segmentation/transcript-event-segmentation.service'
import { TranscriptEventSegmentationConfigService } from './modules/transcript-event-segmentation/transcript-event-segmentation-config.service'
import { randomBytes } from 'crypto'
import { SpeechService } from './modules/speech/speech.service'
import { isSegmentKeyRollback } from './modules/transcript/segment-key'
import {
  shouldSplitByContent,
  shouldSplitBySegmentKeyChange,
} from './modules/transcript/realtime-split'

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
    .setDescription('提供实时语音转写和语句拆分功能')
    .setVersion('1.0')
    .addTag('sessions', '会话管理')
    .addTag('speeches', '发言记录')
    .addTag('transcript', '实时转写')
    .addTag('transcript-event-segmentation', '语句拆分')
    .addTag('debug-errors', '会话调试报错')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  const port = process.env.PORT ? Number(process.env.PORT) : 5181

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
  const smartAudioBufferService = app.get(SmartAudioBufferService)
  const glmAsrClient = app.get(GlmAsrClient)
  const speechService = app.get(SpeechService)
  const transcriptStreamService = app.get(TranscriptStreamService)
  const debugErrorService = app.get(DebugErrorService)
  const transcriptEventSegmentationService = app.get(TranscriptEventSegmentationService)
  const transcriptEventSegmentationConfigService = app.get(TranscriptEventSegmentationConfigService)
  transcriptEventSegmentationService.setOnSegmentUpdate((data: TranscriptEventSegmentDTO) => {
    broadcastToSession(data.sessionId, {
      type: 'transcript_event_segment_upsert',
      data,
    })
  })
  transcriptEventSegmentationService.setOnSegmentReset((sessionId: string) => {
    broadcastToSession(sessionId, {
      type: 'transcript_event_segment_reset',
      data: { sessionId },
    })
  })
  transcriptEventSegmentationService.setOnProgressUpdate(
    (data: TranscriptEventSegmentationProgressDTO) => {
      broadcastToSession(data.sessionId, {
        type: 'transcript_event_segmentation_progress',
        data,
      })
    }
  )

  const rawEventStreamEnabled = true // 默认启用原文事件流

  // WebSocket Logger
  const wsLogger = new Logger('WebSocket')

  // WebSocket 连接管理
  const clientSessions = new Map<WebSocket, string>()
  // 使用 Map 代替 WeakMap，确保 clientId 在连接期间保持稳定
  const clientIds = new Map<WebSocket, string>()
  const audioStarted = new WeakSet<WebSocket>()
  const glmQueueByClientId = new Map<string, Promise<void>>()

  const sessionClients = new Map<string, Set<WebSocket>>()
  const activeSpeechByClientId = new Map<
    string,
    {
      sessionId: string
      speechId: string
      segmentKey?: string
      lastContent: string
      lastUpdateAtMs: number
    }
  >()

  // raw_llm：segmentKey -> eventIndex 映射（每 session + client，用于原文流 upsert）
  const segmentKeyToEventIndexBySessionClient = new Map<string, Map<string, number>>()
  // 保存每个 segmentKey 对应的原始内容（用于 15 秒强制分段时标记 isFinal）
  const segmentKeyContentBySessionClient = new Map<string, Map<string, string>>()
  // 保存每个 segmentKey 对应的原始音频累计时长（用于落库与展示）
  const segmentKeyAudioDurationMsBySessionClient = new Map<string, Map<string, number>>()

  // 追踪每 session + client 的活跃 segmentKey（用于检测段落变化并标记 isFinal）
  const activeSegmentKeyBySessionClient = new Map<string, string>()

  const transcriptEventSegmentationTimerBySession = new Map<string, ReturnType<typeof setTimeout>>()
  const transcriptEventSegmentationInFlight = new Set<string>()
  const transcriptEventSegmentationPending = new Set<string>()
  const transcriptEventSegmentationLastRunAtBySession = new Map<string, number>()
  const getSegmentationConfig = () => transcriptEventSegmentationConfigService.getConfig()
  const getSegmentationIntervalMs = () => getSegmentationConfig().intervalMs
  const shouldTriggerEventSegmentationOnStopTranscribe = () =>
    getSegmentationConfig().triggerOnStopTranscribe

  wss.on('connection', (ws: WebSocket) => {
    const clientId = createClientId()
    clientIds.set(ws, clientId)
    smartAudioBufferService.updateConfig(clientId)
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
                segmentKeyToEventIndexBySessionClient.delete(
                  getSegmentKeyMapKey(previousSessionId, clientId)
                )
                segmentKeyContentBySessionClient.delete(
                  getSegmentKeyMapKey(previousSessionId, clientId)
                )
                smartAudioBufferService.flush(clientId)
              }

              clientSessions.set(ws, nextSessionId)
              addClientToSession(nextSessionId, ws)

              ws.send(
                JSON.stringify({
                  type: 'status',
                  data: {
                    sessionId: nextSessionId,
                    status: 'session_set',
                  },
                })
              )
            }
            break

          case 'start_transcribe':
            {
              const clientId = getClientId(ws)
              if (clientId) {
                const asrConfig = readAsrConfig(message)
                smartAudioBufferService.updateConfig(clientId, asrConfig)
              }
              ws.send(
                JSON.stringify({
                  type: 'status',
                  data: { status: 'transcribe_started' },
                })
              )
            }
            break

          case 'stop_transcribe':
            {
              const clientId = getClientId(ws)
              if (clientId) {
                const sessionId = clientSessions.get(ws)
                if (sessionId) {
                  const flushed = smartAudioBufferService.flush(clientId, { force: true })
                  if (flushed.buffer) {
                    await enqueueGlmTranscription(
                      sessionId,
                      clientId,
                      flushed.buffer,
                      flushed.durationMs
                    )
                  } else {
                    const pending = glmQueueByClientId.get(clientId)
                    if (pending) {
                      await pending
                    }
                    await finalizeActiveSpeechForClient(clientId)
                  }

                  if (shouldTriggerEventSegmentationOnStopTranscribe()) {
                    triggerTranscriptEventSegmentationNow(sessionId, 'stop_transcribe')
                  }
                } else {
                  smartAudioBufferService.flush(clientId)
                  await finalizeActiveSpeechForClient(clientId)
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

          const appended = smartAudioBufferService.appendAudio(clientId, data as Buffer)
          if (appended.buffer) {
            void enqueueGlmTranscription(sessionId, clientId, appended.buffer, appended.durationMs)
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
        smartAudioBufferService.clear(clientId)
        glmQueueByClientId.delete(clientId)
        void finalizeActiveSpeechForClient(clientId)
      }
      const sessionId = clientSessions.get(ws)
      if (clientId && sessionId) {
        segmentKeyToEventIndexBySessionClient.delete(getSegmentKeyMapKey(sessionId, clientId))
        segmentKeyContentBySessionClient.delete(getSegmentKeyMapKey(sessionId, clientId))
        segmentKeyAudioDurationMsBySessionClient.delete(getSegmentKeyMapKey(sessionId, clientId))
      }
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

  function readAsrConfig(message: Record<string, unknown>): Partial<AsrConfigDto> {
    const rawConfig =
      message.asrConfig && typeof message.asrConfig === 'object'
        ? (message.asrConfig as Record<string, unknown>)
        : {}

    return {
      bufferDurationMs: readNumber(rawConfig.bufferDurationMs ?? message.bufferDurationMs),
      minAudioLengthMs: readNumber(rawConfig.minAudioLengthMs ?? message.minAudioLengthMs),
      language: readString(rawConfig.language ?? message.language),
      hotwords: readStringArray(rawConfig.hotwords ?? message.hotwords),
      prompt: readString(rawConfig.prompt ?? message.prompt),
    }
  }

  function readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }

  function readString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }

  function readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined
    const filtered = value.filter(item => typeof item === 'string') as string[]
    return filtered.length > 0 ? filtered : undefined
  }

  function enqueueGlmTranscription(
    sessionId: string,
    clientId: string,
    audioBuffer: Buffer,
    audioDurationMs: number
  ): Promise<void> {
    const task = async () => {
      await processGlmBuffer(sessionId, clientId, audioBuffer, audioDurationMs)
    }

    const previous = glmQueueByClientId.get(clientId) ?? Promise.resolve()
    const next = previous
      .then(task)
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error)
        wsLogger.error(`GLM ASR failed, clientId=${clientId}: ${message}`)
        sendErrorToClient(clientId, message)
      })
      .finally(() => {
        if (glmQueueByClientId.get(clientId) === next) {
          glmQueueByClientId.delete(clientId)
        }
      })

    glmQueueByClientId.set(clientId, next)
    return next
  }

  async function processGlmBuffer(
    sessionId: string,
    clientId: string,
    audioBuffer: Buffer,
    audioDurationMs: number
  ): Promise<void> {
    const config = smartAudioBufferService.getConfig(clientId)
    const fallbackSegmentKey = `glm:${clientId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 10)}`
    let segmentKey: string | undefined

    for await (const chunk of glmAsrClient.transcribeStream(audioBuffer, {
      language: config.language,
      hotwords: config.hotwords,
      prompt: config.prompt,
    })) {
      if (!segmentKey) {
        segmentKey = chunk.requestId ? `glm:${chunk.requestId}` : fallbackSegmentKey
      }

      if (!chunk.text) {
        if (chunk.isFinal) {
          await finalizeActiveSpeechForClient(clientId)
        }
        continue
      }

      await persistAndBroadcastTranscript(sessionId, clientId, {
        content: chunk.text,
        confidence: 0,
        isFinal: chunk.isFinal,
        segmentKey,
      })

      await persistAndBroadcastTranscriptEvent(sessionId, clientId, {
        content: chunk.text,
        isFinal: chunk.isFinal,
        segmentKey,
        asrTimestampMs: Date.now(),
        audioDurationMs: chunk.isFinal ? audioDurationMs : undefined,
      })
    }
  }

  async function transcribePcmWithGlm(
    audioBuffer: Buffer,
    config?: AsrConfigDto
  ): Promise<{ text: string; requestId?: string; isFinal: boolean } | null> {
    if (!audioBuffer || audioBuffer.length === 0) {
      return null
    }

    let text = ''
    let isFinal = false
    let requestId: string | undefined

    for await (const chunk of glmAsrClient.transcribeStream(audioBuffer, {
      language: config?.language,
      hotwords: config?.hotwords,
      prompt: config?.prompt,
    })) {
      if (!requestId && chunk.requestId) {
        requestId = chunk.requestId
      }
      if (chunk.text) {
        text = chunk.text
      }
      if (chunk.isFinal) {
        isFinal = true
      }
    }

    if (!text) {
      return null
    }

    return { text, requestId, isFinal }
  }

  function sendErrorToClient(clientId: string, error: string): void {
    for (const [ws, id] of clientIds.entries()) {
      if (id !== clientId) continue
      if (ws.readyState !== WebSocket.OPEN) continue
      ws.send(
        JSON.stringify({
          type: 'error',
          data: { error },
        })
      )
      return
    }
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

  function getSegmentKeyMapKey(sessionId: string, clientId: string): string {
    return `${sessionId}:${clientId}`
  }

  function getSegmentKeyMap(sessionId: string, clientId: string): Map<string, number> {
    const key = getSegmentKeyMapKey(sessionId, clientId)
    const existing = segmentKeyToEventIndexBySessionClient.get(key)
    if (existing) return existing

    const created = new Map<string, number>()
    segmentKeyToEventIndexBySessionClient.set(key, created)
    return created
  }

  function getSegmentKeyContentMap(sessionId: string, clientId: string): Map<string, string> {
    const key = getSegmentKeyMapKey(sessionId, clientId)
    const existing = segmentKeyContentBySessionClient.get(key)
    if (existing) return existing

    const created = new Map<string, string>()
    segmentKeyContentBySessionClient.set(key, created)
    return created
  }

  function getSegmentKeyAudioDurationMap(sessionId: string, clientId: string): Map<string, number> {
    const key = getSegmentKeyMapKey(sessionId, clientId)
    const existing = segmentKeyAudioDurationMsBySessionClient.get(key)
    if (existing) return existing

    const created = new Map<string, number>()
    segmentKeyAudioDurationMsBySessionClient.set(key, created)
    return created
  }

  function readNumberFromEnv(
    key: string,
    defaultValue: number,
    isValid: (value: number) => boolean
  ): number {
    const raw = process.env[key]
    if (!raw) return defaultValue
    const value = Number(raw)
    return Number.isFinite(value) && isValid(value) ? value : defaultValue
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
      segmentKey?: string
    }
  ): Promise<void> {
    const content = normalizeTranscriptContent(input.content)
    if (!content) return
    const now = new Date()
    const nowMs = Date.now()
    const active = activeSpeechByClientId.get(clientId)

    if (isSegmentKeyRollback(active?.segmentKey, input.segmentKey)) {
      // 部分流式 ASR 会偶发回传“更早的 utterance 更新”（数组重排/回写），直接落库会导致前端出现插入/重复段落。
      // 这里选择忽略回退段落，优先保证实时展示稳定；最终文本以 stop_transcribe/finalizeAudio 为准。
      return
    }

    if (
      active &&
      (active.sessionId !== sessionId ||
        (input.segmentKey &&
          active.segmentKey &&
          input.segmentKey !== active.segmentKey &&
          shouldSplitBySegmentKeyChange(active.lastContent, content)) ||
        (active.segmentKey == null &&
          input.segmentKey == null &&
          nowMs - active.lastUpdateAtMs >= getAutoSplitGapMs()) ||
        (active.segmentKey == null &&
          input.segmentKey == null &&
          shouldSplitByContent(active.lastContent, content)))
    ) {
      // 边界变化：先结束上一段，避免全部拼成一条
      await finalizeActiveSpeechForClient(clientId)
    }

    const refreshed = activeSpeechByClientId.get(clientId)

    let speech
    if (!refreshed || refreshed.sessionId !== sessionId) {
      speech = await speechService.create({
        sessionId,
        content,
        confidence: input.confidence,
      })
      activeSpeechByClientId.set(clientId, {
        sessionId,
        speechId: speech.id,
        segmentKey: input.segmentKey,
        lastContent: content,
        lastUpdateAtMs: nowMs,
      })
    } else {
      speech = await speechService.updateRealtime(refreshed.speechId, {
        content,
        confidence: input.confidence,
        endTime: now,
      })
      refreshed.segmentKey = input.segmentKey ?? refreshed.segmentKey
      refreshed.lastContent = content
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

  async function persistAndBroadcastTranscriptEvent(
    sessionId: string,
    clientId: string,
    input: {
      content: string
      isFinal: boolean
      segmentKey?: string
      asrTimestampMs?: number
      audioDurationMs?: number
      eventIndex?: number
    }
  ): Promise<void> {
    if (!rawEventStreamEnabled) return
    const content = normalizeTranscriptContent(input.content)
    if (!content) return

    // 原文流：优先按 segmentKey 更新同一句话；无 segmentKey 时追加新事件
    try {
      const segmentKeyMap = input.segmentKey ? getSegmentKeyMap(sessionId, clientId) : null
      const segmentKeyContentMap = input.segmentKey
        ? getSegmentKeyContentMap(sessionId, clientId)
        : null
      const segmentKeyDurationMap = input.segmentKey
        ? getSegmentKeyAudioDurationMap(sessionId, clientId)
        : null

      if (
        segmentKeyDurationMap &&
        input.segmentKey &&
        typeof input.audioDurationMs === 'number' &&
        Number.isFinite(input.audioDurationMs) &&
        input.audioDurationMs > 0
      ) {
        const previousDuration = segmentKeyDurationMap.get(input.segmentKey) ?? 0
        segmentKeyDurationMap.set(
          input.segmentKey,
          Math.max(0, Math.floor(previousDuration + input.audioDurationMs))
        )
      }

      // 当 segmentKey 变化时，把之前的 segmentKey 对应的事件标记为 isFinal=true
      // 这是因为 ASR 在音频较长时可能分段返回结果，但 is_final=false
      if (input.segmentKey) {
        const sessionClientKey = getSegmentKeyMapKey(sessionId, clientId)
        const activeSegmentKey = activeSegmentKeyBySessionClient.get(sessionClientKey)

        if (segmentKeyContentMap && !segmentKeyContentMap.has(input.segmentKey)) {
          segmentKeyContentMap.set(input.segmentKey, content)
        }

        if (activeSegmentKey && activeSegmentKey !== input.segmentKey) {
          // segmentKey 变化了，把之前的段落标记为 isFinal=true
          const previousEventIndex = segmentKeyMap?.get(activeSegmentKey)
          if (previousEventIndex != null) {
            const previousContent = segmentKeyContentMap?.get(activeSegmentKey) ?? content
            const previousResult = await transcriptStreamService.upsertEvent({
              sessionId,
              eventIndex: previousEventIndex,
              content: previousContent,
              isFinal: true, // 标记为最终
              segmentKey: activeSegmentKey,
              asrTimestampMs: input.asrTimestampMs,
              audioDurationMs: segmentKeyDurationMap?.get(activeSegmentKey),
            })

            if (segmentKeyContentMap) {
              segmentKeyContentMap.delete(activeSegmentKey)
            }
            if (segmentKeyDurationMap) {
              segmentKeyDurationMap.delete(activeSegmentKey)
            }

            broadcastToSession(sessionId, {
              type: 'transcript_event_upsert',
              data: previousResult,
            })
          }
        }
        // 更新活跃的 segmentKey
        activeSegmentKeyBySessionClient.set(sessionClientKey, input.segmentKey)
      }

      const existingEventIndex = input.segmentKey ? segmentKeyMap?.get(input.segmentKey) : undefined
      const shouldMarkRollback = input.eventIndex != null || existingEventIndex != null

      const resolvedAudioDurationMs = input.segmentKey
        ? segmentKeyDurationMap?.get(input.segmentKey)
        : input.audioDurationMs

      const result = await transcriptStreamService.upsertEvent({
        sessionId,
        eventIndex: input.eventIndex ?? existingEventIndex,
        content,
        isFinal: input.isFinal,
        segmentKey: input.segmentKey, // 保留用于调试和追溯
        asrTimestampMs: input.asrTimestampMs,
        audioDurationMs: resolvedAudioDurationMs,
      })

      if (segmentKeyMap && input.segmentKey) {
        segmentKeyMap.set(input.segmentKey, result.event.eventIndex)
      }

      broadcastToSession(sessionId, {
        type: 'transcript_event_upsert',
        data: {
          sessionId,
          revision: result.revision,
          event: result.event,
        },
      })

      if (input.isFinal && segmentKeyDurationMap && input.segmentKey) {
        segmentKeyDurationMap.delete(input.segmentKey)
      }

      if (shouldMarkRollback) {
        await transcriptEventSegmentationService.markRollback(sessionId, result.event.eventIndex)
      }

      scheduleTranscriptEventSegmentation(sessionId)
    } catch (error) {
      wsLogger.warn(
        `Persist transcript event failed, sessionId=${sessionId}, clientId=${clientId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  function scheduleTranscriptEventSegmentationAfter(
    sessionId: string,
    delayMs: number,
    reason: string
  ): void {
    if (!rawEventStreamEnabled) return
    if (transcriptEventSegmentationService.isRebuildInFlight(sessionId)) return

    const existing = transcriptEventSegmentationTimerBySession.get(sessionId)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(
      () => {
        transcriptEventSegmentationTimerBySession.delete(sessionId)
        void runTranscriptEventSegmentation(sessionId, { force: false, reason })
      },
      Math.max(0, delayMs)
    )

    transcriptEventSegmentationTimerBySession.set(sessionId, timer)
  }

  function scheduleTranscriptEventSegmentation(sessionId: string): void {
    if (!rawEventStreamEnabled) return
    if (transcriptEventSegmentationService.isRebuildInFlight(sessionId)) return
    const intervalMs = getSegmentationIntervalMs()
    if (!intervalMs || intervalMs <= 0) {
      void runTranscriptEventSegmentation(sessionId, { force: false, reason: 'interval_disabled' })
      return
    }

    scheduleTranscriptEventSegmentationAfter(sessionId, intervalMs, 'debounce')
  }

  function triggerTranscriptEventSegmentationNow(sessionId: string, reason: string): void {
    if (!rawEventStreamEnabled) return
    if (transcriptEventSegmentationService.isRebuildInFlight(sessionId)) return

    const intervalMs = getSegmentationIntervalMs()
    if (intervalMs > 0) {
      const lastRunAt = transcriptEventSegmentationLastRunAtBySession.get(sessionId) ?? 0
      const nextAllowedAt = lastRunAt + intervalMs
      const now = Date.now()
      if (now < nextAllowedAt) {
        scheduleTranscriptEventSegmentationAfter(sessionId, nextAllowedAt - now, `merged_${reason}`)
        return
      }
    }

    const existing = transcriptEventSegmentationTimerBySession.get(sessionId)
    if (existing) {
      clearTimeout(existing)
      transcriptEventSegmentationTimerBySession.delete(sessionId)
    }

    void runTranscriptEventSegmentation(sessionId, { force: true, reason })
  }

  function normalizeTranscriptContent(value: string): string | null {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    if (!trimmed || trimmed === '#') return null
    return trimmed
  }

  async function runTranscriptEventSegmentation(
    sessionId: string,
    input: { force: boolean; reason: string }
  ): Promise<void> {
    if (transcriptEventSegmentationService.isRebuildInFlight(sessionId)) {
      return
    }
    if (transcriptEventSegmentationInFlight.has(sessionId)) {
      transcriptEventSegmentationPending.add(sessionId)
      return
    }

    transcriptEventSegmentationInFlight.add(sessionId)
    transcriptEventSegmentationLastRunAtBySession.set(sessionId, Date.now())
    try {
      const maxSegmentsPerRun = readNumberFromEnv(
        'TRANSCRIPT_EVENTS_SEGMENT_MAX_SEGMENTS_PER_RUN',
        8,
        value => value >= 1 && value <= 100
      )

      for (let i = 0; i < maxSegmentsPerRun; i += 1) {
        const created = await transcriptEventSegmentationService.generateNextSegment({
          sessionId,
          force: input.force,
        })
        if (!created) break
      }
    } catch (error) {
      wsLogger.warn(
        `Transcript event segmentation task failed, sessionId=${sessionId}, reason=${input.reason}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      transcriptEventSegmentationInFlight.delete(sessionId)
      if (transcriptEventSegmentationPending.delete(sessionId)) {
        void runTranscriptEventSegmentation(sessionId, { force: false, reason: 'pending' })
      }
    }
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
