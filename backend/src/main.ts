import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import * as http from 'http'
import * as WebSocket from 'ws'
import { TranscriptService } from './modules/transcript/transcript.service'
import { SmartAudioBufferService } from './modules/transcript/smart-audio-buffer.service'
import { GlmAsrClient } from './modules/transcript/glm-asr.client'
import type { AsrConfigDto } from './modules/transcript/dto/transcript.dto'
import { TranscriptStreamService } from './modules/transcript-stream/transcript-stream.service'
import { TurnSegmentationService } from './modules/turn-segmentation/turn-segmentation.service'
import { DebugErrorService } from './modules/debug-error/debug-error.service'
import {
  TranscriptAnalysisService,
  TranscriptAnalysisUpsertData,
} from './modules/transcript-analysis/transcript-analysis.service'
import { TranscriptAnalysisGlmClient } from './modules/transcript-analysis/transcript-analysis.glm-client'
import { TranscriptAnalysisChunk } from './modules/transcript-analysis/schemas/transcript-analysis-chunk.schema'
import { TranscriptAnalysisState } from './modules/transcript-analysis/schemas/transcript-analysis-state.schema'
import {
  TranscriptEventSegmentationService,
  TranscriptEventSegmentDTO,
} from './modules/transcript-event-segmentation/transcript-event-segmentation.service'
import { TranscriptEventSegmentationGlmClient } from './modules/transcript-event-segmentation/transcript-event-segmentation.glm-client'
import { TranscriptEventSegment } from './modules/transcript-event-segmentation/schemas/transcript-event-segment.schema'
import { randomBytes } from 'crypto'
import { SpeechService } from './modules/speech/speech.service'
import { SpeakerService } from './modules/speech/speaker.service'
import {
  AnonymousSpeakerCluster,
  SpeakerEmbedding,
  TurnAudioSnapshot,
  TurnDetector,
  getDefaultTurnModeConfig,
} from './modules/transcript/turn-mode'
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
    .setDescription('提供实时语音转写和AI分析功能')
    .setVersion('1.0')
    .addTag('sessions', '会话管理')
    .addTag('speeches', '发言记录')
    .addTag('analysis', 'AI分析')
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
  const transcriptService = app.get(TranscriptService)
  const smartAudioBufferService = app.get(SmartAudioBufferService)
  const glmAsrClient = app.get(GlmAsrClient)
  const speechService = app.get(SpeechService)
  const speakerService = app.get(SpeakerService)
  const transcriptStreamService = app.get(TranscriptStreamService)
  const turnSegmentationService = app.get(TurnSegmentationService)
  const debugErrorService = app.get(DebugErrorService)
  const transcriptAnalysisChunkModel = app.get(getModelToken(TranscriptAnalysisChunk.name))
  const transcriptAnalysisStateModel = app.get(getModelToken(TranscriptAnalysisState.name))
  const transcriptAnalysisGlmClient = app.get(TranscriptAnalysisGlmClient)
  const transcriptAnalysisService = new TranscriptAnalysisService(
    transcriptAnalysisChunkModel,
    transcriptAnalysisStateModel,
    transcriptStreamService,
    transcriptAnalysisGlmClient,
    debugErrorService,
    configService,
    (data: TranscriptAnalysisUpsertData) => {
      broadcastToSession(data.sessionId, {
        type: 'transcript_analysis_upsert',
        data,
      })
    }
  )
  const transcriptEventSegmentModel = app.get(getModelToken(TranscriptEventSegment.name))
  const transcriptEventSegmentationGlmClient = app.get(TranscriptEventSegmentationGlmClient)
  const transcriptEventSegmentationService = new TranscriptEventSegmentationService(
    transcriptEventSegmentModel,
    transcriptStreamService,
    transcriptEventSegmentationGlmClient,
    debugErrorService,
    configService,
    (data: TranscriptEventSegmentDTO) => {
      broadcastToSession(data.sessionId, {
        type: 'transcript_event_segment_upsert',
        data,
      })
    }
  )

  const transcriptPipeline = process.env.TRANSCRIPT_PIPELINE || 'raw_llm'
  const rawEventStreamEnabled = true // 默认启用原文事件流
  const turnSegmentationEnabled =
    rawEventStreamEnabled &&
    ((process.env.TRANSCRIPT_SEGMENT_ENABLED || '').trim().toLowerCase() === '1' ||
      (process.env.TRANSCRIPT_SEGMENT_ENABLED || '').trim().toLowerCase() === 'true')

  // WebSocket Logger
  const wsLogger = new Logger('WebSocket')

  // WebSocket 连接管理
  const clientSessions = new Map<WebSocket, string>()
  // 使用 Map 代替 WeakMap，确保 clientId 在连接期间保持稳定
  const clientIds = new Map<WebSocket, string>()
  const audioStarted = new WeakSet<WebSocket>()
  const modelByClientId = new Map<string, string>()
  const glmQueueByClientId = new Map<string, Promise<void>>()

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

  // raw_llm：segmentKey -> eventIndex 映射（每 session + client，用于原文流 upsert）
  const segmentKeyToEventIndexBySessionClient = new Map<string, Map<string, number>>()
  // 保存每个 segmentKey 对应的原始内容（用于 15 秒强制分段时标记 isFinal）
  const segmentKeyContentBySessionClient = new Map<string, Map<string, string>>()

  // 追踪每 session + client 的活跃 segmentKey（用于检测段落变化并标记 isFinal）
  const activeSegmentKeyBySessionClient = new Map<string, string>()

  const turnModeEnabled = process.env.TRANSCRIPT_TURN_MODE === '1'
  const turnModeConfig = getDefaultTurnModeConfig()
  const turnDetectorByClientId = new Map<string, TurnDetector>()
  const speakerClusterBySession = new Map<string, AnonymousSpeakerCluster>()
  const lastSpeakerIdBySession = new Map<string, string>()

  // raw_llm：分段调度（按 session 去抖 + 强触发）
  const turnSegmentationTimerBySession = new Map<string, ReturnType<typeof setTimeout>>()
  const turnSegmentationInFlight = new Set<string>()
  const turnSegmentationPending = new Set<string>()
  const turnSegmentationIntervalMs = readNumberFromEnv(
    'TRANSCRIPT_SEGMENT_INTERVAL_MS',
    3000,
    value => value >= 0 && value <= 10 * 60 * 1000
  )
  const triggerSegmentationOnEndTurn = process.env.TRANSCRIPT_SEGMENT_TRIGGER_ON_END_TURN !== '0'
  const triggerSegmentationOnStopTranscribe =
    process.env.TRANSCRIPT_SEGMENT_TRIGGER_ON_STOP_TRANSCRIBE !== '0'

  const transcriptEventSegmentationTimerBySession = new Map<string, ReturnType<typeof setTimeout>>()
  const transcriptEventSegmentationInFlight = new Set<string>()
  const transcriptEventSegmentationPending = new Set<string>()
  const transcriptEventSegmentationIntervalMs = readNumberFromEnv(
    'TRANSCRIPT_EVENTS_SEGMENT_INTERVAL_MS',
    3000,
    value => value >= 0 && value <= 10 * 60 * 1000
  )
  const triggerEventSegmentationOnEndTurn =
    process.env.TRANSCRIPT_EVENTS_SEGMENT_TRIGGER_ON_END_TURN !== '0'
  const triggerEventSegmentationOnStopTranscribe =
    process.env.TRANSCRIPT_EVENTS_SEGMENT_TRIGGER_ON_STOP_TRANSCRIBE !== '0'

  wss.on('connection', (ws: WebSocket) => {
    const clientId = createClientId()
    clientIds.set(ws, clientId)
    modelByClientId.set(clientId, 'doubao')
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
              speakerNameBySessionSpeakerId.set(
                getSpeakerDirectoryKey(sessionId, next.speakerId),
                next.speakerName
              )

              ws.send(
                JSON.stringify({
                  type: 'status',
                  data: { status: 'speaker_set', ...next },
                })
              )
            }
            break

          case 'start_transcribe':
            {
              const clientId = getClientId(ws)
              if (clientId) {
                const model = resolveAsrModel(message?.model)
                modelByClientId.set(clientId, model)
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
                const model = resolveClientModel(clientId)
                if (!turnModeEnabled && model === 'glm') {
                  if (sessionId) {
                    const flushed = smartAudioBufferService.flush(clientId, { force: true })
                    if (flushed.buffer) {
                      await enqueueGlmTranscription(sessionId, clientId, flushed.buffer)
                    } else {
                      const pending = glmQueueByClientId.get(clientId)
                      if (pending) {
                        await pending
                      }
                      await finalizeActiveSpeechForClient(clientId)
                    }

                    if (triggerSegmentationOnStopTranscribe) {
                      triggerTurnSegmentationNow(sessionId, 'stop_transcribe')
                    }
                    if (triggerEventSegmentationOnStopTranscribe) {
                      triggerTranscriptEventSegmentationNow(sessionId, 'stop_transcribe')
                    }
                    triggerTranscriptAnalysisNow(sessionId)
                  } else {
                    smartAudioBufferService.flush(clientId)
                    await finalizeActiveSpeechForClient(clientId)
                  }
                } else if (turnModeEnabled) {
                  if (sessionId) {
                    await finalizeTurnForClient(sessionId, clientId)
                  } else {
                    await transcriptService.endAudio(clientId)
                  }
                } else if (sessionId) {
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

                    await persistAndBroadcastTranscriptEvent(sessionId, clientId, {
                      content: result.content,
                      isFinal: true,
                      speakerId: result.speakerId,
                      speakerName: result.speakerName,
                      segmentKey: result.segmentKey,
                      asrTimestampMs: Date.now(),
                    })

                    if (triggerSegmentationOnStopTranscribe) {
                      triggerTurnSegmentationNow(sessionId, 'stop_transcribe')
                    }
                    if (triggerEventSegmentationOnStopTranscribe) {
                      triggerTranscriptEventSegmentationNow(sessionId, 'stop_transcribe')
                    }
                    triggerTranscriptAnalysisNow(sessionId)
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

          case 'end_turn':
            {
              const clientId = getClientId(ws)
              const sessionId =
                clientSessions.get(ws) ??
                (typeof message.sessionId === 'string' && message.sessionId.trim().length > 0
                  ? message.sessionId.trim()
                  : undefined)
              if (!clientId || !sessionId) {
                break
              }

              const model = resolveClientModel(clientId)

              if (!turnModeEnabled && model === 'glm') {
                const flushed = smartAudioBufferService.flush(clientId, { force: true })
                if (flushed.buffer) {
                  await enqueueGlmTranscription(sessionId, clientId, flushed.buffer)
                } else {
                  const pending = glmQueueByClientId.get(clientId)
                  if (pending) {
                    await pending
                  }
                  await finalizeActiveSpeechForClient(clientId)
                }
              } else if (turnModeEnabled) {
                await finalizeTurnForClient(sessionId, clientId)
              } else {
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

                  await persistAndBroadcastTranscriptEvent(sessionId, clientId, {
                    content: result.content,
                    isFinal: true,
                    speakerId: result.speakerId,
                    speakerName: result.speakerName,
                    segmentKey: result.segmentKey,
                    asrTimestampMs: Date.now(),
                  })
                } else {
                  await finalizeActiveSpeechForClient(clientId)
                }
              }
              if (triggerSegmentationOnEndTurn) {
                triggerTurnSegmentationNow(sessionId, 'end_turn')
              }
              if (triggerEventSegmentationOnEndTurn) {
                triggerTranscriptEventSegmentationNow(sessionId, 'end_turn')
              }
              triggerTranscriptAnalysisNow(sessionId)
              ws.send(
                JSON.stringify({
                  type: 'status',
                  data: { status: 'turn_finalized' },
                })
              )
            }
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

          if (turnModeEnabled) {
            await handleTurnModePcmChunk(sessionId, clientId, data as Buffer)
            return
          }

          const model = resolveClientModel(clientId)
          if (model === 'glm') {
            const appended = smartAudioBufferService.appendAudio(clientId, data as Buffer)
            if (appended.buffer) {
              void enqueueGlmTranscription(sessionId, clientId, appended.buffer)
            }
            return
          }

          const result = await transcriptService.processBinaryAudio(
            clientId,
            data as Buffer,
            sessionId,
            {
              propagateError: true,
            }
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

            await persistAndBroadcastTranscriptEvent(sessionId, clientId, {
              content: result.content,
              isFinal: result.isFinal,
              speakerId: result.speakerId,
              speakerName: result.speakerName,
              segmentKey: result.segmentKey,
              asrTimestampMs: Date.now(),
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
        turnDetectorByClientId.delete(clientId)
        smartAudioBufferService.clear(clientId)
        modelByClientId.delete(clientId)
        glmQueueByClientId.delete(clientId)
        void finalizeActiveSpeechForClient(clientId)
      }
      const sessionId = clientSessions.get(ws)
      if (clientId && sessionId) {
        segmentKeyToEventIndexBySessionClient.delete(getSegmentKeyMapKey(sessionId, clientId))
        segmentKeyContentBySessionClient.delete(getSegmentKeyMapKey(sessionId, clientId))
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

  function resolveAsrModel(raw: unknown): string {
    if (typeof raw !== 'string') return 'doubao'
    const normalized = raw.trim().toLowerCase()
    return normalized || 'doubao'
  }

  function resolveClientModel(clientId: string): string {
    return resolveAsrModel(modelByClientId.get(clientId))
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
    audioBuffer: Buffer
  ): Promise<void> {
    const task = async () => {
      await processGlmBuffer(sessionId, clientId, audioBuffer)
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
    audioBuffer: Buffer
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

      const speakerMeta = ensureSpeakerMeta(sessionId, clientId)
      await persistAndBroadcastTranscript(sessionId, clientId, {
        content: chunk.text,
        confidence: 0,
        isFinal: chunk.isFinal,
        speakerId: speakerMeta.speakerId,
        speakerName: speakerMeta.speakerName,
        segmentKey,
      })

      await persistAndBroadcastTranscriptEvent(sessionId, clientId, {
        content: chunk.text,
        isFinal: chunk.isFinal,
        speakerId: speakerMeta.speakerId,
        speakerName: speakerMeta.speakerName,
        segmentKey,
        asrTimestampMs: Date.now(),
      })
    }
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

  function getSpeakerMetaKey(sessionId: string, clientId: string): string {
    return `${sessionId}:${clientId}`
  }

  function getSpeakerDirectoryKey(sessionId: string, speakerId: string): string {
    return `${sessionId}:${speakerId}`
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
    speakerNameBySessionSpeakerId.set(
      getSpeakerDirectoryKey(sessionId, meta.speakerId),
      meta.speakerName
    )
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

    const speakerId =
      rawSpeakerId && rawSpeakerId !== `client_${clientId}` ? rawSpeakerId : meta.speakerId
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

  function getTurnDetector(clientId: string): TurnDetector {
    const existing = turnDetectorByClientId.get(clientId)
    if (existing) return existing
    const created = new TurnDetector(turnModeConfig)
    turnDetectorByClientId.set(clientId, created)
    return created
  }

  function getSpeakerCluster(sessionId: string): AnonymousSpeakerCluster {
    const existing = speakerClusterBySession.get(sessionId)
    if (existing) return existing

    const sameTh = readNumberFromEnv(
      'TRANSCRIPT_TURN_SPK_SAME_TH',
      0.75,
      value => value > 0 && value <= 1
    )
    const newTh = readNumberFromEnv(
      'TRANSCRIPT_TURN_SPK_NEW_TH',
      0.6,
      value => value >= 0 && value < 1
    )

    const created = new AnonymousSpeakerCluster(sessionId, { sameTh, newTh })
    speakerClusterBySession.set(sessionId, created)
    return created
  }

  async function handleTurnModePcmChunk(
    sessionId: string,
    clientId: string,
    chunk: Buffer
  ): Promise<void> {
    const detector = getTurnDetector(clientId)
    const nowMs = Date.now()
    const { shouldFinalizeTurn } = detector.pushPcmChunk(chunk, nowMs)

    if (detector.hasActiveTurn()) {
      // turn 模式下仍使用豆包流式链路喂音频，但不广播中间结果
      await transcriptService.processBinaryAudio(clientId, chunk, sessionId, {
        propagateError: true,
      })
    }

    if (!shouldFinalizeTurn) {
      return
    }

    await finalizeTurn(sessionId, clientId, detector.snapshot())
    detector.reset()
  }

  async function finalizeTurnForClient(sessionId: string, clientId: string): Promise<void> {
    const detector = turnDetectorByClientId.get(clientId)
    if (!detector?.hasActiveTurn()) {
      await transcriptService.endAudio(clientId)
      return
    }

    await finalizeTurn(sessionId, clientId, detector.snapshot())
    detector.reset()
  }

  async function finalizeTurn(
    sessionId: string,
    clientId: string,
    snapshot: TurnAudioSnapshot | null
  ): Promise<void> {
    const result = await transcriptService.finalizeAudio(clientId, sessionId, {
      propagateError: true,
    })
    if (!result?.content) {
      return
    }

    const speakerId = await resolveAnonymousSpeakerId(sessionId, clientId, snapshot)

    await persistAndBroadcastTranscript(sessionId, clientId, {
      content: result.content,
      confidence: result.confidence,
      isFinal: true,
      speakerId,
      speakerName: '',
      segmentKey: undefined,
    })

    await persistAndBroadcastTranscriptEvent(sessionId, clientId, {
      content: result.content,
      isFinal: true,
      speakerId,
      speakerName: '',
      segmentKey: undefined,
      asrTimestampMs: Date.now(),
    })
  }

  async function resolveAnonymousSpeakerId(
    sessionId: string,
    clientId: string,
    snapshot: TurnAudioSnapshot | null
  ): Promise<string> {
    const fallback =
      lastSpeakerIdBySession.get(sessionId) ?? ensureSpeakerMeta(sessionId, clientId).speakerId

    const embedUrl = process.env.TRANSCRIPT_TURN_EMBEDDING_URL
    if (!embedUrl) {
      return fallback
    }

    if (!snapshot || snapshot.voicedMs < turnModeConfig.minEmbeddingVoicedMs) {
      return fallback
    }

    const embedding = await fetchSpeakerEmbedding(embedUrl, snapshot.pcm)
    if (!embedding || embedding.length === 0) {
      return fallback
    }

    const cluster = getSpeakerCluster(sessionId)
    const speakerId = cluster.assign(embedding)
    lastSpeakerIdBySession.set(sessionId, speakerId)
    return speakerId
  }

  async function fetchSpeakerEmbedding(url: string, pcm: Buffer): Promise<SpeakerEmbedding | null> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          format: 'pcm_s16le',
          sampleRate: 16000,
          channels: 1,
          audioBase64: pcm.toString('base64'),
        }),
      })

      if (!response.ok) {
        wsLogger.warn(`Embedding service failed: status=${response.status}`)
        return null
      }

      const data = (await response.json()) as { embedding?: unknown }
      const embedding = data?.embedding
      if (!Array.isArray(embedding)) return null

      const values: number[] = []
      for (const item of embedding) {
        const value = Number(item)
        if (!Number.isFinite(value)) return null
        values.push(value)
      }
      return values
    } catch (error) {
      wsLogger.warn(
        `Embedding request failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
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

    if (isSegmentKeyRollback(active?.segmentKey, input.segmentKey)) {
      // 部分流式 ASR 会偶发回传“更早的 utterance 更新”（数组重排/回写），直接落库会导致前端出现插入/重复段落。
      // 这里选择忽略回退段落，优先保证实时展示稳定；最终文本以 stop_transcribe/finalizeAudio 为准。
      return
    }

    if (
      active &&
      (active.sessionId !== sessionId ||
        active.speakerId !== assigned.id ||
        (input.segmentKey &&
          active.segmentKey &&
          input.segmentKey !== active.segmentKey &&
          shouldSplitBySegmentKeyChange(active.lastContent, input.content)) ||
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

  async function persistAndBroadcastTranscriptEvent(
    sessionId: string,
    clientId: string,
    input: {
      content: string
      isFinal: boolean
      speakerId: string
      speakerName: string
      segmentKey?: string
      asrTimestampMs?: number
      eventIndex?: number
    }
  ): Promise<void> {
    if (!rawEventStreamEnabled) return
    if (!input.content) return

    const resolved = resolveSpeaker(sessionId, clientId, input.speakerId, input.speakerName)

    // 原文流：优先按 segmentKey 更新同一句话；无 segmentKey 时追加新事件
    try {
      const segmentKeyMap = input.segmentKey ? getSegmentKeyMap(sessionId, clientId) : null
      const segmentKeyContentMap = input.segmentKey
        ? getSegmentKeyContentMap(sessionId, clientId)
        : null

      // 当 segmentKey 变化时，把之前的 segmentKey 对应的事件标记为 isFinal=true
      // 这是因为豆包 ASR 在音频 > 15s 时会强制分段返回结果，但 is_final=false
      if (input.segmentKey) {
        const sessionClientKey = getSegmentKeyMapKey(sessionId, clientId)
        const activeSegmentKey = activeSegmentKeyBySessionClient.get(sessionClientKey)

        if (segmentKeyContentMap && !segmentKeyContentMap.has(input.segmentKey)) {
          segmentKeyContentMap.set(input.segmentKey, input.content)
        }

        if (activeSegmentKey && activeSegmentKey !== input.segmentKey) {
          // segmentKey 变化了，把之前的段落标记为 isFinal=true
          const previousEventIndex = segmentKeyMap?.get(activeSegmentKey)
          if (previousEventIndex != null) {
            const previousContent = segmentKeyContentMap?.get(activeSegmentKey) ?? input.content
            await transcriptStreamService.upsertEvent({
              sessionId,
              eventIndex: previousEventIndex,
              speakerId: resolved.speakerId,
              speakerName: resolved.speakerName,
              content: previousContent,
              isFinal: true, // 标记为最终
              segmentKey: activeSegmentKey,
              asrTimestampMs: input.asrTimestampMs,
            })
            // 广播更新后的事件
            broadcastToSession(sessionId, {
              type: 'transcript_event_upsert',
              data: {
                sessionId,
                revision: 0, // 会被 upsertEvent 更新
                event: {
                  eventIndex: previousEventIndex,
                  speakerId: resolved.speakerId,
                  speakerName: resolved.speakerName,
                  content: previousContent,
                  isFinal: true,
                  segmentKey: activeSegmentKey,
                },
              },
            })
          }
        }
        // 更新活跃的 segmentKey
        activeSegmentKeyBySessionClient.set(sessionClientKey, input.segmentKey)
      }

      const existingEventIndex = input.segmentKey ? segmentKeyMap?.get(input.segmentKey) : undefined
      const shouldMarkRollback = input.eventIndex != null || existingEventIndex != null

      const result = await transcriptStreamService.upsertEvent({
        sessionId,
        eventIndex: input.eventIndex ?? existingEventIndex,
        speakerId: resolved.speakerId,
        speakerName: resolved.speakerName,
        content: input.content,
        isFinal: input.isFinal,
        segmentKey: input.segmentKey, // 保留用于调试和追溯
        asrTimestampMs: input.asrTimestampMs,
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

      if (shouldMarkRollback) {
        await transcriptAnalysisService.markRollback(sessionId, result.event.eventIndex)
      }

      scheduleTurnSegmentation(sessionId)
      transcriptAnalysisService.schedule(sessionId)
      scheduleTranscriptEventSegmentation(sessionId)
    } catch (error) {
      wsLogger.warn(
        `Persist transcript event failed, sessionId=${sessionId}, clientId=${clientId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  function scheduleTurnSegmentation(sessionId: string): void {
    if (!turnSegmentationEnabled) return
    if (!turnSegmentationIntervalMs || turnSegmentationIntervalMs <= 0) {
      void runTurnSegmentation(sessionId, { force: false, reason: 'interval_disabled' })
      return
    }

    const existing = turnSegmentationTimerBySession.get(sessionId)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(() => {
      turnSegmentationTimerBySession.delete(sessionId)
      void runTurnSegmentation(sessionId, { force: false, reason: 'debounce' })
    }, turnSegmentationIntervalMs)

    turnSegmentationTimerBySession.set(sessionId, timer)
  }

  function scheduleTranscriptEventSegmentation(sessionId: string): void {
    if (!rawEventStreamEnabled) return
    if (!transcriptEventSegmentationIntervalMs || transcriptEventSegmentationIntervalMs <= 0) {
      void runTranscriptEventSegmentation(sessionId, { force: false, reason: 'interval_disabled' })
      return
    }

    const existing = transcriptEventSegmentationTimerBySession.get(sessionId)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(() => {
      transcriptEventSegmentationTimerBySession.delete(sessionId)
      void runTranscriptEventSegmentation(sessionId, { force: false, reason: 'debounce' })
    }, transcriptEventSegmentationIntervalMs)

    transcriptEventSegmentationTimerBySession.set(sessionId, timer)
  }

  function triggerTurnSegmentationNow(sessionId: string, reason: string): void {
    if (!turnSegmentationEnabled) return

    const existing = turnSegmentationTimerBySession.get(sessionId)
    if (existing) {
      clearTimeout(existing)
      turnSegmentationTimerBySession.delete(sessionId)
    }

    void runTurnSegmentation(sessionId, { force: true, reason })
  }

  function triggerTranscriptEventSegmentationNow(sessionId: string, reason: string): void {
    if (!rawEventStreamEnabled) return

    const existing = transcriptEventSegmentationTimerBySession.get(sessionId)
    if (existing) {
      clearTimeout(existing)
      transcriptEventSegmentationTimerBySession.delete(sessionId)
    }

    void runTranscriptEventSegmentation(sessionId, { force: true, reason })
  }

  function triggerTranscriptAnalysisNow(sessionId: string): void {
    transcriptAnalysisService.schedule(sessionId, { force: true })
  }

  async function runTurnSegmentation(
    sessionId: string,
    input: { force: boolean; reason: string }
  ): Promise<void> {
    if (turnSegmentationInFlight.has(sessionId)) {
      turnSegmentationPending.add(sessionId)
      return
    }

    turnSegmentationInFlight.add(sessionId)
    try {
      const state = await transcriptStreamService.getState({ sessionId })
      const snapshot = await turnSegmentationService.getSnapshot(sessionId)

      if (!input.force) {
        if (snapshot.status === 'processing' && snapshot.targetRevision === state.revision) {
          return
        }
        if (snapshot.targetRevision >= state.revision) {
          return
        }
      }

      const processing = await turnSegmentationService.markProcessing({
        sessionId,
        targetRevision: state.revision,
      })

      broadcastToSession(sessionId, {
        type: 'turn_segments_upsert',
        data: processing,
      })

      const result = await turnSegmentationService.segmentAndPersist({
        sessionId,
        targetRevision: state.revision,
      })

      broadcastToSession(sessionId, {
        type: 'turn_segments_upsert',
        data: result,
      })
    } catch (error) {
      wsLogger.warn(
        `Turn segmentation task failed, sessionId=${sessionId}, reason=${input.reason}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      turnSegmentationInFlight.delete(sessionId)
      if (turnSegmentationPending.delete(sessionId)) {
        void runTurnSegmentation(sessionId, { force: false, reason: 'pending' })
      }
    }
  }

  async function runTranscriptEventSegmentation(
    sessionId: string,
    input: { force: boolean; reason: string }
  ): Promise<void> {
    if (transcriptEventSegmentationInFlight.has(sessionId)) {
      transcriptEventSegmentationPending.add(sessionId)
      return
    }

    transcriptEventSegmentationInFlight.add(sessionId)
    try {
      await transcriptEventSegmentationService.generateNextSegment({
        sessionId,
        force: input.force,
      })
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
