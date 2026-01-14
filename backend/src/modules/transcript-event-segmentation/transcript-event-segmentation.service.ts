import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { TranscriptStreamService } from '../transcript-stream/transcript-stream.service'
import type { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'
import { DebugErrorService } from '../debug-error/debug-error.service'
import { TranscriptEventSegmentationGlmClient } from './transcript-event-segmentation.glm-client'
import { TranscriptEventSegmentationConfigService } from './transcript-event-segmentation-config.service'
import { buildTranscriptEventSegmentationPrompt } from './transcript-event-segmentation.prompt'
import { parseTranscriptEventSegmentJson } from './transcript-event-segmentation.validation'
import {
  extractRawNextSegment,
  normalizeForPunctuationOnlyCompare,
  resolveEventOffsetRange,
} from './transcript-event-segmentation.extraction'
import {
  TranscriptEventSegment,
  TranscriptEventSegmentDocument,
} from './schemas/transcript-event-segment.schema'
import { randomBytes } from 'crypto'

export type TranscriptEventSegmentDTO = {
  id: string
  sessionId: string
  sequence: number
  content: string
  sourceStartEventIndex: number
  sourceEndEventIndex: number
  sourceStartEventIndexExact?: number
  sourceStartEventOffset?: number
  sourceEndEventIndexExact?: number
  sourceEndEventOffset?: number
  sourceRevision: number
  prevSegmentId?: string
  status: 'completed' | 'failed'
  error?: string
  model?: string
  generatedAt?: string
  createdAt?: string
}

export type TranscriptEventSegmentsSnapshotDTO = {
  sessionId: string
  segments: TranscriptEventSegmentDTO[]
}

type TranscriptEventSegmentUpdateHandler = (data: TranscriptEventSegmentDTO) => void
type TranscriptEventSegmentResetHandler = (sessionId: string) => void
export type TranscriptEventSegmentationProgressDTO = {
  sessionId: string
  taskId: string
  mode: 'incremental' | 'rebuild'
  stage: 'queued' | 'calling_llm' | 'parsing' | 'persisting' | 'completed' | 'failed'
  pointerEventIndex: number
  windowStartEventIndex: number
  windowEndEventIndex: number
  maxEventIndex: number
  sequence?: number
  model?: string
  message?: string
  updatedAt: string
}
type TranscriptEventSegmentationProgressHandler = (
  data: TranscriptEventSegmentationProgressDTO
) => void
type PersistedTranscriptEventSegment = {
  dto: TranscriptEventSegmentDTO
  createdId: TranscriptEventSegmentDocument['_id']
}

@Injectable()
export class TranscriptEventSegmentationService {
  private readonly logger = new Logger(TranscriptEventSegmentationService.name)
  private onSegmentUpdate?: TranscriptEventSegmentUpdateHandler
  private onSegmentReset?: TranscriptEventSegmentResetHandler
  private onProgressUpdate?: TranscriptEventSegmentationProgressHandler
  private readonly rebuildInFlightBySession = new Set<string>()

  constructor(
    @InjectModel(TranscriptEventSegment.name)
    private readonly segmentModel: Model<TranscriptEventSegmentDocument>,
    private readonly transcriptStreamService: TranscriptStreamService,
    private readonly glmClient: TranscriptEventSegmentationGlmClient,
    private readonly debugErrorService: DebugErrorService,
    private readonly configService: TranscriptEventSegmentationConfigService
  ) {}

  setOnSegmentUpdate(handler?: TranscriptEventSegmentUpdateHandler | null): void {
    this.onSegmentUpdate = handler ?? undefined
  }

  setOnSegmentReset(handler?: TranscriptEventSegmentResetHandler | null): void {
    this.onSegmentReset = handler ?? undefined
  }

  setOnProgressUpdate(handler?: TranscriptEventSegmentationProgressHandler | null): void {
    this.onProgressUpdate = handler ?? undefined
  }

  isRebuildInFlight(sessionId: string): boolean {
    const normalized = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!normalized) return false
    return this.rebuildInFlightBySession.has(normalized)
  }

  async getSnapshot(sessionId: string): Promise<TranscriptEventSegmentsSnapshotDTO> {
    const segments = await this.segmentModel.find({ sessionId }).sort({ sequence: -1 }).exec()

    return {
      sessionId,
      segments: segments.map(segment => this.toDTO(segment)),
    }
  }

  async generateNextSegment(input: {
    sessionId: string
    force?: boolean
  }): Promise<TranscriptEventSegmentDTO | null> {
    const sessionId = input.sessionId
    if (!sessionId) return null

    const state = await this.transcriptStreamService.getState({ sessionId })
    const endEventIndex = Math.max(-1, state.nextEventIndex - 1)
    if (endEventIndex < 0) return null

    const lastSegment = await this.segmentModel.findOne({ sessionId }).sort({ sequence: -1 }).exec()

    const baseWindowSize = this.readChunkSize()
    const maxWindowSize = 2000
    let windowSize = baseWindowSize
    let startEventIndex = Math.max(0, endEventIndex - windowSize + 1)
    let events = await this.transcriptStreamService.getEventsInRange({
      sessionId,
      startEventIndex,
      endEventIndex,
    })
    if (!events.length) return null

    const previousSentence = lastSegment?.content ?? ''
    if (previousSentence) {
      let extraction = extractRawNextSegment({ previousSentence, events })
      while (extraction.previousSentenceFoundAt < 0 && startEventIndex > 0 && windowSize < maxWindowSize) {
        windowSize = Math.min(maxWindowSize, windowSize * 2)
        startEventIndex = Math.max(0, endEventIndex - windowSize + 1)
        events = await this.transcriptStreamService.getEventsInRange({
          sessionId,
          startEventIndex,
          endEventIndex,
        })
        if (!events.length) return null
        extraction = extractRawNextSegment({ previousSentence, events })
      }

      if (extraction.previousSentenceFoundAt < 0) {
        this.logger.warn(
          `Transcript event segmentation skipped: previousSentence out of window, sessionId=${sessionId}, endEventIndex=${endEventIndex}, windowSize=${windowSize}`
        )
        return null
      }
    }

    const modelName = this.glmClient.getModelName()

    const nextSequence = (lastSegment?.sequence ?? 0) + 1
    const created = await this.generateAndPersistSegment({
      sessionId,
      taskId: this.createTaskId(),
      mode: 'incremental',
      maxEventIndex: endEventIndex,
      previousSentence,
      prevSegmentId: lastSegment?._id,
      nextSequence,
      sourceStartEventIndex: startEventIndex,
      sourceEndEventIndex: endEventIndex,
      sourceRevision: state.revision,
      events,
      modelName,
      forceFlush: !!input.force,
    })

    return created?.dto ?? null
  }

  async rebuildFromStart(sessionId: string): Promise<{ started: boolean }> {
    const normalized = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!normalized) return { started: false }
    if (this.rebuildInFlightBySession.has(normalized)) return { started: false }

    this.rebuildInFlightBySession.add(normalized)
    void this.runRebuildFromStart(normalized).finally(() => {
      this.rebuildInFlightBySession.delete(normalized)
    })

    return { started: true }
  }

  async markRollback(sessionId: string, eventIndex: number): Promise<void> {
    const trimmedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!trimmedSessionId) return

    const threshold = Math.max(0, Math.floor(eventIndex))
    await this.segmentModel
      .deleteMany({ sessionId: trimmedSessionId, sourceEndEventIndex: { $gte: threshold } })
      .exec()

    this.emitSegmentReset(trimmedSessionId)
  }

  private emitSegmentUpdate(data: TranscriptEventSegmentDTO): void {
    this.onSegmentUpdate?.(data)
  }

  private emitSegmentReset(sessionId: string): void {
    this.onSegmentReset?.(sessionId)
  }

  private emitProgressUpdate(data: TranscriptEventSegmentationProgressDTO): void {
    this.onProgressUpdate?.(data)
  }

  private createTaskId(): string {
    return randomBytes(8).toString('hex')
  }

  private createProgressEmitter(
    base: Omit<TranscriptEventSegmentationProgressDTO, 'stage' | 'updatedAt'>
  ) {
    return (stage: TranscriptEventSegmentationProgressDTO['stage'], message?: string) => {
      this.emitProgressUpdate({
        ...base,
        stage,
        ...(message ? { message } : {}),
        updatedAt: new Date().toISOString(),
      })
    }
  }

  private toDTO(segment: TranscriptEventSegmentDocument): TranscriptEventSegmentDTO {
    return {
      id: segment._id.toString(),
      sessionId: segment.sessionId,
      sequence: segment.sequence,
      content: segment.content,
      sourceStartEventIndex: segment.sourceStartEventIndex,
      sourceEndEventIndex: segment.sourceEndEventIndex,
      sourceStartEventIndexExact: segment.sourceStartEventIndexExact,
      sourceStartEventOffset: segment.sourceStartEventOffset,
      sourceEndEventIndexExact: segment.sourceEndEventIndexExact,
      sourceEndEventOffset: segment.sourceEndEventOffset,
      sourceRevision: segment.sourceRevision,
      prevSegmentId: segment.prevSegmentId?.toString(),
      status: segment.status,
      error: segment.error,
      model: segment.model,
      generatedAt: segment.generatedAt ? segment.generatedAt.toISOString() : undefined,
      createdAt: segment.createdAt ? segment.createdAt.toISOString() : undefined,
    }
  }

  private readChunkSize(): number {
    return this.configService.getConfig().windowEvents
  }

  private buildGlmErrorContext(error: unknown): Record<string, unknown> | null {
    if (!error || typeof error !== 'object') {
      return null
    }
    const source = error as {
      glmResponse?: unknown
      glmStatus?: unknown
      response?: { data?: unknown; status?: unknown }
    }
    const response = source.glmResponse ?? source.response?.data
    const status = source.glmStatus ?? source.response?.status

    if (response == null && status == null) {
      return null
    }

    const context: Record<string, unknown> = {}
    if (status != null) {
      context.status = status
    }
    if (response != null) {
      context.response = response
    }
    return context
  }

  private async generateAndPersistSegment(input: {
    sessionId: string
    taskId: string
    mode: TranscriptEventSegmentationProgressDTO['mode']
    maxEventIndex: number
    previousSentence: string
    prevSegmentId?: TranscriptEventSegmentDocument['_id']
    nextSequence: number
    sourceStartEventIndex: number
    sourceEndEventIndex: number
    sourceRevision: number
    events: TranscriptEventDTO[]
    modelName: string
    forceFlush?: boolean
  }): Promise<PersistedTranscriptEventSegment | null> {
    const emitProgress = this.createProgressEmitter({
      sessionId: input.sessionId,
      taskId: input.taskId,
      mode: input.mode,
      pointerEventIndex: input.sourceEndEventIndex,
      windowStartEventIndex: input.sourceStartEventIndex,
      windowEndEventIndex: input.sourceEndEventIndex,
      maxEventIndex: input.maxEventIndex,
      sequence: input.nextSequence,
      model: input.modelName,
    })

    const extraction = extractRawNextSegment({
      previousSentence: input.previousSentence,
      events: input.events,
    })

    const exactOffsetRange = resolveEventOffsetRange(
      input.events,
      extraction.startOffset,
      extraction.endOffset
    )

    const extractedText = extraction.rawSegment.trim()
    if (!extractedText) {
      this.logger.warn(
        `Transcript event segmentation skipped: extractedText is empty, sessionId=${input.sessionId}`
      )
      return null
    }

    const isRebuildFinalFlush = input.mode === 'rebuild' && input.forceFlush
    const shouldSkipDanglingTail =
      !isRebuildFinalFlush &&
      extraction.endReason === 'window_end' &&
      !extraction.hasSentenceEndPunctuation &&
      extractedText.length < 120

    if (shouldSkipDanglingTail) {
      return null
    }

    const prompt = buildTranscriptEventSegmentationPrompt({
      sessionId: input.sessionId,
      previousSentence: input.previousSentence,
      startEventIndex: input.sourceStartEventIndex,
      endEventIndex: input.sourceEndEventIndex,
      events: input.events,
      extractedText,
      systemPrompt: this.configService.getConfig().systemPrompt,
      strictSystemPrompt: this.configService.getConfig().strictSystemPrompt,
    })
    const promptLength = prompt.system.length + prompt.user.length

    try {
      emitProgress('queued')
      emitProgress('calling_llm')
      const raw = await this.glmClient.generateStructuredJson(prompt)
      emitProgress('parsing')
      const parsed = parseTranscriptEventSegmentJson(raw)

      const candidate = typeof parsed.nextSentence === 'string' ? parsed.nextSentence.trim() : ''
      const normalizedCandidate = normalizeForPunctuationOnlyCompare(candidate)
      const normalizedExtracted = normalizeForPunctuationOnlyCompare(extractedText)

      let nextSentence = ''
      let persistStatus: TranscriptEventSegmentDTO['status'] = 'completed'
      let persistError: string | undefined

      const shouldRejectShortPrefix = (value: string): boolean => {
        if (!value) return false
        if (value.length >= extractedText.length) return false
        const tail = extractedText.slice(value.length)
        const endsWithTemporalSuffix = /([0-9一二三四五六七八九十]+(年|月|日|号)|[年月日号])$/u.test(
          value
        )
        const continuesWithVerb =
          /^(刚刚|刚才|刚|已经|才|就)?(创建|成立|建立|完成|生成|发布|上线|写成|制作)/u.test(tail)
        return endsWithTemporalSuffix && continuesWithVerb
      }

      if (
        candidate &&
        normalizedCandidate &&
        normalizedExtracted.startsWith(normalizedCandidate) &&
        !shouldRejectShortPrefix(candidate)
      ) {
        nextSentence = candidate
      } else {
        const retryPrompt = buildTranscriptEventSegmentationPrompt({
          sessionId: input.sessionId,
          previousSentence: input.previousSentence,
          startEventIndex: input.sourceStartEventIndex,
          endEventIndex: input.sourceEndEventIndex,
          events: input.events,
          extractedText,
          strictEcho: true,
          systemPrompt: this.configService.getConfig().systemPrompt,
          strictSystemPrompt: this.configService.getConfig().strictSystemPrompt,
        })
        const retryRaw = await this.glmClient.generateStructuredJson(retryPrompt)
        const retryParsed = parseTranscriptEventSegmentJson(retryRaw)
        const retryCandidate =
          typeof retryParsed.nextSentence === 'string' ? retryParsed.nextSentence.trim() : ''

        const extractedTrimmed = extractedText.trim()
        const normalizedRetryCandidate = normalizeForPunctuationOnlyCompare(retryCandidate)
        if (
          retryCandidate &&
          normalizedRetryCandidate &&
          normalizeForPunctuationOnlyCompare(extractedTrimmed).startsWith(normalizedRetryCandidate) &&
          !shouldRejectShortPrefix(retryCandidate)
        ) {
          nextSentence = retryCandidate
        } else {
          nextSentence = extractedTrimmed
          persistStatus = 'failed'
          persistError = 'LLM 输出未能满足约束，已降级为 extractor 输出前缀'

          void this.debugErrorService.recordError({
            sessionId: input.sessionId,
            level: 'warn',
            message: 'Transcript event segmentation degraded: LLM output mismatch',
            source: 'glm-api',
            category: 'transcript-event-segmentation',
            error: new Error('LLM 输出未能满足“只加标点不改字/逐字一致”的约束'),
            context: {
              model: input.modelName,
              promptLength,
              revision: input.sourceRevision,
              startEventIndex: input.sourceStartEventIndex,
              endEventIndex: input.sourceEndEventIndex,
              extractedText: extractedTrimmed,
              llmCandidate: candidate,
              llmRetryCandidate: retryCandidate,
            },
            occurredAt: new Date(),
          })
        }
      }

      emitProgress('persisting')
      const created = await this.segmentModel.create({
        sessionId: input.sessionId,
        sequence: input.nextSequence,
        content: nextSentence,
        sourceStartEventIndex: input.sourceStartEventIndex,
        sourceEndEventIndex: input.sourceEndEventIndex,
        sourceStartEventIndexExact: exactOffsetRange?.startEventIndex,
        sourceStartEventOffset: exactOffsetRange?.startEventOffset,
        sourceEndEventIndexExact: exactOffsetRange?.endEventIndex,
        sourceEndEventOffset: exactOffsetRange?.endEventOffset,
        sourceRevision: input.sourceRevision,
        prevSegmentId: input.prevSegmentId,
        status: persistStatus,
        error: persistError,
        model: input.modelName,
        promptSystem: prompt.system,
        promptUser: prompt.user,
        promptLength,
        generatedAt: new Date(),
      })

      const dto = this.toDTO(created)
      this.emitSegmentUpdate(dto)
      emitProgress('completed')
      return { dto, createdId: created._id }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(
        `Transcript event segmentation failed, sessionId=${input.sessionId}: ${message}`
      )
      emitProgress('failed', message)
      const glmErrorContext = this.buildGlmErrorContext(error)
      void this.debugErrorService.recordError({
        sessionId: input.sessionId,
        level: 'error',
        message: `Transcript event segmentation failed: ${message}`,
        source: 'glm-api',
        category: 'transcript-event-segmentation',
        error,
        context: {
          model: input.modelName,
          promptLength,
          revision: input.sourceRevision,
          startEventIndex: input.sourceStartEventIndex,
          endEventIndex: input.sourceEndEventIndex,
          ...(glmErrorContext ? { glm: glmErrorContext } : {}),
        },
        occurredAt: new Date(),
      })
      return null
    }
  }

  private async runRebuildFromStart(sessionId: string): Promise<void> {
    this.logger.log(`Transcript event segmentation rebuild started, sessionId=${sessionId}`)

    const state = await this.transcriptStreamService.getState({ sessionId })
    const endEventIndex = Math.max(-1, state.nextEventIndex - 1)

    await this.segmentModel.deleteMany({ sessionId }).exec()
    this.emitSegmentReset(sessionId)

    if (endEventIndex < 0) {
      return
    }

    const windowSize = this.readChunkSize()
    const modelName = this.glmClient.getModelName()

    let previousSentence = ''
    let prevSegmentId: TranscriptEventSegmentDocument['_id'] | undefined
    let nextSequence = 1

    const maxEvents = 2000
    const cappedEnd = Math.min(endEventIndex, maxEvents - 1)
    const maxSegmentsPerEvent = 50
    for (let currentEnd = 0; currentEnd <= cappedEnd; currentEnd += 1) {
      const currentStart = Math.max(0, currentEnd - windowSize + 1)
      const events = await this.transcriptStreamService.getEventsInRange({
        sessionId,
        startEventIndex: currentStart,
        endEventIndex: currentEnd,
      })
      if (!events.length) {
        continue
      }

      for (let segmentIndex = 0; segmentIndex < maxSegmentsPerEvent; segmentIndex += 1) {
      const created = await this.generateAndPersistSegment({
        sessionId,
        taskId: this.createTaskId(),
        mode: 'rebuild',
        maxEventIndex: cappedEnd,
        previousSentence,
        prevSegmentId,
        nextSequence,
        sourceStartEventIndex: currentStart,
        sourceEndEventIndex: currentEnd,
        sourceRevision: state.revision,
        events,
        modelName,
        forceFlush: currentEnd === cappedEnd,
      })

        if (!created) {
          break
        }

        previousSentence = created.dto.content
        prevSegmentId = created.createdId
        nextSequence += 1
      }
    }

    if (endEventIndex >= maxEvents) {
      this.logger.warn(
        `Transcript event segmentation rebuild capped at ${maxEvents} events, sessionId=${sessionId}, endEventIndex=${endEventIndex}`
      )
    }

    this.logger.log(`Transcript event segmentation rebuild completed, sessionId=${sessionId}`)
  }
}
