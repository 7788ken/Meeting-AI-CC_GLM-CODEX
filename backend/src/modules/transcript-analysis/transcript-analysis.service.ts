import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import {
  TranscriptStreamService,
  TranscriptEventDTO,
} from '../transcript-stream/transcript-stream.service'
import { DebugErrorService } from '../debug-error/debug-error.service'
import { TranscriptAnalysisGlmClient } from './transcript-analysis.glm-client'
import { buildTranscriptAnalysisPrompt } from './transcript-analysis.prompt'
import {
  heuristicDialoguesBySpeaker,
  parseTranscriptAnalysisJson,
  ParsedTranscriptAnalysis,
  validateAndNormalizeDialogues,
} from './transcript-analysis.validation'
import {
  TranscriptAnalysisChunk,
  TranscriptAnalysisChunkDocument,
  TranscriptDialogue,
} from './schemas/transcript-analysis-chunk.schema'
import {
  TranscriptAnalysisState,
  TranscriptAnalysisStateDocument,
} from './schemas/transcript-analysis-state.schema'

export interface TranscriptAnalysisUpsertData {
  sessionId: string
  status: 'processing' | 'completed' | 'failed'
  startEventIndex: number
  endEventIndex: number
  targetEventIndex: number
  dialogues: Array<{
    speakerId: string
    speakerName: string
    startEventIndex: number
    endEventIndex: number
    content: string
    correctedContent?: string
  }>
  modelUsed: 'glm' | 'heuristic'
  generatedAt?: string
  error?: string
}

export type GetSessionAnalysisResponse = {
  sessionId: string
  chunks: Array<{
    startEventIndex: number
    endEventIndex: number
    status: 'processing' | 'completed' | 'failed'
    dialogues: Array<{
      speakerId: string
      speakerName: string
      startEventIndex: number
      endEventIndex: number
      content: string
      correctedContent?: string
    }>
    modelUsed?: 'glm' | 'heuristic'
    generatedAt?: string
    error?: string
  }>
}

type TranscriptAnalysisChunkUpdateHandler = (data: TranscriptAnalysisUpsertData) => void

@Injectable()
export class TranscriptAnalysisService {
  private readonly logger = new Logger(TranscriptAnalysisService.name)
  private readonly queuedSessions = new Set<string>()
  private readonly inFlightSessions = new Set<string>()
  private readonly pendingSessions = new Set<string>()
  private readonly forceSessions = new Set<string>()
  private readonly maxRequestedEventIndices = new Map<string, number>()
  private readonly queue: string[] = []
  private inFlightCount = 0

  constructor(
    @InjectModel(TranscriptAnalysisChunk.name)
    private readonly chunkModel: Model<TranscriptAnalysisChunkDocument>,
    @InjectModel(TranscriptAnalysisState.name)
    private readonly stateModel: Model<TranscriptAnalysisStateDocument>,
    private readonly transcriptStreamService: TranscriptStreamService,
    private readonly glmClient: TranscriptAnalysisGlmClient,
    private readonly debugErrorService: DebugErrorService,
    private readonly configService: ConfigService,
    @Optional() private readonly onChunkUpdate?: TranscriptAnalysisChunkUpdateHandler
  ) {}

  schedule(sessionId: string, options?: { force?: boolean }): void {
    if (!sessionId) return

    void this.refreshMaxRequestedEventIndex(sessionId)

    if (options?.force) {
      this.forceSessions.add(sessionId)
    }

    if (this.queuedSessions.has(sessionId)) {
      return
    }

    if (this.inFlightSessions.has(sessionId)) {
      this.pendingSessions.add(sessionId)
      return
    }

    this.queuedSessions.add(sessionId)
    this.queue.push(sessionId)
    this.drainQueue()
  }

  async getSessionAnalysis(sessionId: string): Promise<GetSessionAnalysisResponse> {
    const chunks = await this.chunkModel
      .find({ sessionId })
      .sort({ startEventIndex: 1, endEventIndex: 1 })
      .exec()

    return {
      sessionId,
      chunks: chunks.map(chunk => ({
        startEventIndex: chunk.startEventIndex,
        endEventIndex: chunk.endEventIndex,
        status: chunk.status,
        dialogues: (chunk.dialogues || []).map(dialogue => ({
          speakerId: dialogue.speakerId,
          speakerName: dialogue.speakerName,
          startEventIndex: dialogue.startEventIndex,
          endEventIndex: dialogue.endEventIndex,
          content: dialogue.content,
          correctedContent: dialogue.correctedContent,
        })),
        modelUsed: chunk.model ? this.normalizeModelUsed(chunk.model) : undefined,
        generatedAt: chunk.generatedAt ? new Date(chunk.generatedAt).toISOString() : undefined,
        error: chunk.error,
      })),
    }
  }

  async markRollback(sessionId: string, eventIndex: number): Promise<void> {
    if (!sessionId) return
    const normalized = Math.max(0, Math.floor(eventIndex))
    const state = await this.getOrCreateState(sessionId)
    if (normalized > state.lastAnalyzedEventIndex) {
      return
    }

    const next =
      state.pendingRollbackEventIndex == null
        ? normalized
        : Math.min(state.pendingRollbackEventIndex, normalized)
    if (next === state.pendingRollbackEventIndex) return

    await this.stateModel
      .findOneAndUpdate({ sessionId }, { $set: { pendingRollbackEventIndex: next } }, { new: true })
      .exec()
  }

  private drainQueue(): void {
    const limit = this.readConcurrencyLimit()
    if (this.inFlightCount >= limit) return

    while (this.inFlightCount < limit && this.queue.length > 0) {
      const sessionId = this.queue.shift()
      if (!sessionId) continue
      this.queuedSessions.delete(sessionId)
      if (this.inFlightSessions.has(sessionId)) {
        continue
      }

      this.inFlightSessions.add(sessionId)
      this.inFlightCount += 1

      const allowPartial = this.forceSessions.delete(sessionId)
      void this.processSession(sessionId, allowPartial)
        .then(result => {
          if (result.requeue) {
            this.schedule(sessionId)
          }
        })
        .catch(error => {
          this.logger.warn(
            `Transcript analysis failed, sessionId=${sessionId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        })
        .finally(() => {
          this.inFlightSessions.delete(sessionId)
          this.inFlightCount = Math.max(0, this.inFlightCount - 1)
          if (this.pendingSessions.delete(sessionId)) {
            this.schedule(sessionId)
          }
          this.drainQueue()
        })
    }
  }

  private async processSession(
    sessionId: string,
    allowPartial: boolean
  ): Promise<{ processed: boolean; requeue: boolean }> {
    let state = await this.getOrCreateState(sessionId)
    state = await this.applyRollbackIfNeeded(sessionId, state)
    let lastAnalyzedEventIndex = state.lastAnalyzedEventIndex
    const maxLoops = 10
    let processed = false

    for (let attempt = 0; attempt < maxLoops; attempt += 1) {
      let maxRequestedEventIndex = this.maxRequestedEventIndices.get(sessionId)
      if (maxRequestedEventIndex != null && lastAnalyzedEventIndex >= maxRequestedEventIndex) {
        this.clearMaxRequestedEventIndexIfDone(sessionId, lastAnalyzedEventIndex)
        return { processed, requeue: false }
      }

      const streamState = await this.transcriptStreamService.getState({ sessionId })
      const maxAvailable = Math.max(-1, streamState.nextEventIndex - 1)
      if (maxRequestedEventIndex == null) {
        this.updateMaxRequestedEventIndex(sessionId, maxAvailable)
        maxRequestedEventIndex = this.maxRequestedEventIndices.get(sessionId)
      }

      if (maxRequestedEventIndex == null || lastAnalyzedEventIndex >= maxRequestedEventIndex) {
        this.clearMaxRequestedEventIndexIfDone(sessionId, lastAnalyzedEventIndex)
        return { processed, requeue: false }
      }

      const targetEventIndex = Math.max(0, lastAnalyzedEventIndex + 1)

      if (targetEventIndex > maxAvailable) {
        return { processed, requeue: false }
      }

      const windowSize = this.readChunkSize()
      const windowStart = Math.max(0, targetEventIndex - windowSize)
      const windowEnd = Math.min(maxAvailable, targetEventIndex + windowSize)
      const windowEvents = await this.transcriptStreamService.getEventsInRange({
        sessionId,
        startEventIndex: windowStart,
        endEventIndex: windowEnd,
      })

      const targetEvent = windowEvents.find(event => event.eventIndex === targetEventIndex)
      if (!targetEvent) {
        return { processed, requeue: false }
      }
      if (this.shouldRequireFinal() && !allowPartial && !targetEvent.isFinal) {
        return { processed, requeue: false }
      }

      const chunkStart = targetEventIndex
      const chunkEnd = targetEventIndex

      await this.markChunkProcessing(sessionId, chunkStart, chunkEnd, targetEventIndex)

      try {
        const { dialogues, modelUsed } = await this.analyzeEvents({
          sessionId,
          events: windowEvents,
          windowStart,
          windowEnd,
          targetEventIndex,
        })

        await this.markChunkCompleted({
          sessionId,
          startEventIndex: chunkStart,
          endEventIndex: chunkEnd,
          targetEventIndex,
          dialogues,
          modelUsed,
        })

        await this.updateLastAnalyzedIndex(sessionId, targetEventIndex)
        lastAnalyzedEventIndex = targetEventIndex
        processed = true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await this.markChunkFailed(sessionId, chunkStart, chunkEnd, targetEventIndex, message)
        return { processed, requeue: false }
      }
    }

    const maxRequestedEventIndex = this.maxRequestedEventIndices.get(sessionId)
    if (maxRequestedEventIndex != null && lastAnalyzedEventIndex >= maxRequestedEventIndex) {
      this.clearMaxRequestedEventIndexIfDone(sessionId, lastAnalyzedEventIndex)
      return { processed, requeue: false }
    }
    const requeue =
      maxRequestedEventIndex != null && lastAnalyzedEventIndex < maxRequestedEventIndex
    return { processed, requeue }
  }

  private updateMaxRequestedEventIndex(sessionId: string, eventIndex: number): void {
    const normalized = Math.max(-1, Math.floor(eventIndex))
    const current = this.maxRequestedEventIndices.get(sessionId)
    if (current == null || normalized > current) {
      this.maxRequestedEventIndices.set(sessionId, normalized)
    }
  }

  private async refreshMaxRequestedEventIndex(sessionId: string): Promise<void> {
    try {
      const streamState = await this.transcriptStreamService.getState({ sessionId })
      const maxAvailable = Math.max(-1, streamState.nextEventIndex - 1)
      this.updateMaxRequestedEventIndex(sessionId, maxAvailable)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(
        `Refresh max requested event index failed, sessionId=${sessionId}: ${message}`
      )
    }
  }

  private clearMaxRequestedEventIndexIfDone(
    sessionId: string,
    lastAnalyzedEventIndex: number
  ): void {
    const current = this.maxRequestedEventIndices.get(sessionId)
    if (current != null && lastAnalyzedEventIndex >= current) {
      this.maxRequestedEventIndices.delete(sessionId)
    }
  }

  private async analyzeEvents(input: {
    sessionId: string
    events: TranscriptEventDTO[]
    windowStart: number
    windowEnd: number
    targetEventIndex: number
  }): Promise<{ dialogues: TranscriptDialogue[]; modelUsed: 'glm' | 'heuristic' }> {
    const prompt = buildTranscriptAnalysisPrompt({
      sessionId: input.sessionId,
      startEventIndex: input.windowStart,
      endEventIndex: input.windowEnd,
      targetEventIndex: input.targetEventIndex,
      events: input.events,
    })
    const promptLength = prompt.system.length + prompt.user.length
    const glmModel = this.glmClient.getModelName()

    const maxAttempts = 2
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const raw = await this.glmClient.generateStructuredJson(prompt)
        const parsed = parseTranscriptAnalysisJson(raw)
        const resolvedEvents = await this.resolveEventsForDialogues({
          sessionId: input.sessionId,
          windowEvents: input.events,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          dialogues: parsed.dialogues,
        })
        return {
          dialogues: validateAndNormalizeDialogues({
            events: resolvedEvents,
            targetEventIndex: input.targetEventIndex,
            dialogues: parsed.dialogues,
          }),
          modelUsed: 'glm',
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const logMessage = `GLM analysis failed, sessionId=${input.sessionId}, attempt=${attempt}/${maxAttempts}: ${message}`
        this.logger.error(logMessage, error instanceof Error ? error.stack : undefined)
        void this.debugErrorService.recordError({
          sessionId: input.sessionId,
          level: 'error',
          message: logMessage,
          source: 'glm-api',
          category: 'transcript-analysis',
          error,
          context: {
            model: glmModel,
            attempt,
            promptLength,
            targetEventIndex: input.targetEventIndex,
          },
          occurredAt: new Date(),
        })
      }
    }

    const warnMessage = `GLM analysis fallback to heuristic, sessionId=${input.sessionId}`
    this.logger.warn(warnMessage)
    void this.debugErrorService.recordError({
      sessionId: input.sessionId,
      level: 'warn',
      message: warnMessage,
      source: 'transcript-analysis',
      category: 'transcript-analysis',
      context: {
        model: glmModel,
        attempt: maxAttempts,
        promptLength,
        targetEventIndex: input.targetEventIndex,
      },
      occurredAt: new Date(),
    })
    return {
      dialogues: heuristicDialoguesBySpeaker({
        events: input.events,
        startEventIndex: input.windowStart,
        endEventIndex: input.windowEnd,
      }),
      modelUsed: 'heuristic',
    }
  }

  private async resolveEventsForDialogues(input: {
    sessionId: string
    windowEvents: TranscriptEventDTO[]
    windowStart: number
    windowEnd: number
    dialogues: ParsedTranscriptAnalysis['dialogues']
  }): Promise<TranscriptEventDTO[]> {
    const range = this.getDialogueRange(input.dialogues)
    if (!range) return input.windowEvents
    if (range.start >= input.windowStart && range.end <= input.windowEnd) {
      return input.windowEvents
    }

    return this.transcriptStreamService.getEventsInRange({
      sessionId: input.sessionId,
      startEventIndex: range.start,
      endEventIndex: range.end,
    })
  }

  private getDialogueRange(
    dialogues: ParsedTranscriptAnalysis['dialogues']
  ): { start: number; end: number } | null {
    if (!dialogues.length) return null
    let minStart = Number.POSITIVE_INFINITY
    let maxEnd = Number.NEGATIVE_INFINITY
    for (const item of dialogues) {
      const segStart = Number(item?.startEventIndex)
      const segEnd = Number(item?.endEventIndex)
      if (!Number.isFinite(segStart) || !Number.isFinite(segEnd)) {
        return null
      }
      const start = Math.max(0, Math.floor(segStart))
      const end = Math.max(start, Math.floor(segEnd))
      minStart = Math.min(minStart, start)
      maxEnd = Math.max(maxEnd, end)
    }

    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
      return null
    }
    return { start: minStart, end: maxEnd }
  }

  private async getOrCreateState(sessionId: string): Promise<TranscriptAnalysisStateDocument> {
    const doc = await this.stateModel
      .findOneAndUpdate(
        { sessionId },
        { $setOnInsert: { sessionId, lastAnalyzedEventIndex: -1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      .exec()
    return doc
  }

  private async applyRollbackIfNeeded(
    sessionId: string,
    state: TranscriptAnalysisStateDocument
  ): Promise<TranscriptAnalysisStateDocument> {
    const rollbackFrom = state.pendingRollbackEventIndex
    if (rollbackFrom == null) return state

    if (rollbackFrom > state.lastAnalyzedEventIndex) {
      return this.stateModel
        .findOneAndUpdate(
          { sessionId },
          { $set: { pendingRollbackEventIndex: undefined } },
          { new: true }
        )
        .exec()
    }

    const overlap = await this.chunkModel
      .findOne({
        sessionId,
        startEventIndex: { $lte: rollbackFrom },
        endEventIndex: { $gte: rollbackFrom },
      })
      .exec()
    const restartFrom = overlap ? overlap.startEventIndex : rollbackFrom

    await this.chunkModel.deleteMany({ sessionId, endEventIndex: { $gte: restartFrom } }).exec()

    const updated = await this.stateModel
      .findOneAndUpdate(
        { sessionId },
        {
          $set: {
            lastAnalyzedEventIndex: restartFrom - 1,
            pendingRollbackEventIndex: undefined,
          },
        },
        { new: true }
      )
      .exec()

    return updated
  }

  private emitChunkUpdate(data: TranscriptAnalysisUpsertData): void {
    if (!this.onChunkUpdate) return
    this.onChunkUpdate(data)
  }

  private normalizeModelUsed(model?: string): 'glm' | 'heuristic' {
    return model === 'heuristic' ? 'heuristic' : 'glm'
  }

  private toUpsertData(
    chunk: TranscriptAnalysisChunkDocument,
    targetEventIndex: number
  ): TranscriptAnalysisUpsertData {
    return {
      sessionId: chunk.sessionId,
      status: chunk.status,
      startEventIndex: chunk.startEventIndex,
      endEventIndex: chunk.endEventIndex,
      targetEventIndex,
      dialogues: (chunk.dialogues || []).map(dialogue => ({
        speakerId: dialogue.speakerId,
        speakerName: dialogue.speakerName,
        startEventIndex: dialogue.startEventIndex,
        endEventIndex: dialogue.endEventIndex,
        content: dialogue.content,
        correctedContent: dialogue.correctedContent,
      })),
      modelUsed: this.normalizeModelUsed(chunk.model),
      generatedAt: chunk.generatedAt ? new Date(chunk.generatedAt).toISOString() : undefined,
      error: chunk.error,
    }
  }

  private async markChunkProcessing(
    sessionId: string,
    startEventIndex: number,
    endEventIndex: number,
    targetEventIndex: number
  ): Promise<void> {
    const updated = await this.chunkModel
      .findOneAndUpdate(
        { sessionId, startEventIndex, endEventIndex },
        {
          $set: {
            status: 'processing',
            dialogues: [],
            error: undefined,
            model: undefined,
            generatedAt: undefined,
          },
          $setOnInsert: { sessionId, startEventIndex, endEventIndex },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      .exec()
    if (updated) {
      this.emitChunkUpdate(this.toUpsertData(updated, targetEventIndex))
    }
  }

  private async markChunkCompleted(input: {
    sessionId: string
    startEventIndex: number
    endEventIndex: number
    targetEventIndex: number
    dialogues: TranscriptDialogue[]
    modelUsed: 'glm' | 'heuristic'
  }): Promise<void> {
    const updated = await this.chunkModel
      .findOneAndUpdate(
        {
          sessionId: input.sessionId,
          startEventIndex: input.startEventIndex,
          endEventIndex: input.endEventIndex,
        },
        {
          $set: {
            status: 'completed',
            dialogues: input.dialogues,
            model: input.modelUsed,
            generatedAt: new Date(),
            error: undefined,
          },
        },
        { new: true }
      )
      .exec()
    if (updated) {
      this.emitChunkUpdate(this.toUpsertData(updated, input.targetEventIndex))
    }
  }

  private async markChunkFailed(
    sessionId: string,
    startEventIndex: number,
    endEventIndex: number,
    targetEventIndex: number,
    error: string
  ): Promise<void> {
    const updated = await this.chunkModel
      .findOneAndUpdate(
        { sessionId, startEventIndex, endEventIndex },
        { $set: { status: 'failed', error } },
        { new: true }
      )
      .exec()
    if (updated) {
      this.emitChunkUpdate(this.toUpsertData(updated, targetEventIndex))
    }
  }

  private async updateLastAnalyzedIndex(sessionId: string, endEventIndex: number): Promise<void> {
    await this.stateModel
      .findOneAndUpdate(
        { sessionId },
        { $set: { lastAnalyzedEventIndex: Math.max(-1, Math.floor(endEventIndex)) } },
        { new: true }
      )
      .exec()
  }

  private readChunkSize(): number {
    const raw =
      this.configService.get<string>('TRANSCRIPT_ANALYSIS_CHUNK_SIZE') ||
      process.env.TRANSCRIPT_ANALYSIS_CHUNK_SIZE ||
      this.configService.get<string>('TRANSCRIPT_ANALYSIS_WINDOW_SIZE') ||
      process.env.TRANSCRIPT_ANALYSIS_WINDOW_SIZE
    const value = Number(raw)
    if (!Number.isFinite(value)) return 2
    return Math.max(1, Math.min(500, Math.floor(value)))
  }

  private readConcurrencyLimit(): number {
    const raw =
      this.configService.get<string>('TRANSCRIPT_ANALYSIS_CONCURRENCY') ||
      process.env.TRANSCRIPT_ANALYSIS_CONCURRENCY
    const value = Number(raw)
    if (!Number.isFinite(value)) return 3
    return Math.max(1, Math.min(10, Math.floor(value)))
  }

  private shouldRequireFinal(): boolean {
    const raw = (
      this.configService.get<string>('TRANSCRIPT_ANALYSIS_REQUIRE_FINAL') ||
      process.env.TRANSCRIPT_ANALYSIS_REQUIRE_FINAL ||
      ''
    )
      .trim()
      .toLowerCase()
    return raw === '1' || raw === 'true'
  }
}
