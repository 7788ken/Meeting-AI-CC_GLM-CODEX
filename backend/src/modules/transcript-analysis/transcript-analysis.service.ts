import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import { TranscriptStreamService, TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'
import { TranscriptAnalysisGlmClient } from './transcript-analysis.glm-client'
import { buildTranscriptAnalysisPrompt } from './transcript-analysis.prompt'
import {
  heuristicDialoguesBySpeaker,
  parseTranscriptAnalysisJson,
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

@Injectable()
export class TranscriptAnalysisService {
  private readonly logger = new Logger(TranscriptAnalysisService.name)
  private readonly queuedSessions = new Set<string>()
  private readonly inFlightSessions = new Set<string>()
  private readonly pendingSessions = new Set<string>()
  private readonly forceSessions = new Set<string>()
  private readonly queue: string[] = []
  private inFlightCount = 0

  constructor(
    @InjectModel(TranscriptAnalysisChunk.name)
    private readonly chunkModel: Model<TranscriptAnalysisChunkDocument>,
    @InjectModel(TranscriptAnalysisState.name)
    private readonly stateModel: Model<TranscriptAnalysisStateDocument>,
    private readonly transcriptStreamService: TranscriptStreamService,
    private readonly glmClient: TranscriptAnalysisGlmClient,
    private readonly configService: ConfigService
  ) {}

  schedule(sessionId: string, options?: { force?: boolean }): void {
    if (!sessionId) return

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

  async markRollback(sessionId: string, eventIndex: number): Promise<void> {
    if (!sessionId) return
    const normalized = Math.max(0, Math.floor(eventIndex))
    const state = await this.getOrCreateState(sessionId)
    if (normalized > state.lastAnalyzedEventIndex) {
      return
    }

    const next = state.pendingRollbackEventIndex == null ? normalized : Math.min(state.pendingRollbackEventIndex, normalized)
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

    const chunkSize = this.readChunkSize()
    const startEventIndex = Math.max(0, state.lastAnalyzedEventIndex + 1)

    const streamState = await this.transcriptStreamService.getState({ sessionId })
    const maxAvailable = Math.max(-1, streamState.nextEventIndex - 1)
    if (startEventIndex > maxAvailable) {
      return { processed: false, requeue: false }
    }

    const maxEnd = Math.min(maxAvailable, startEventIndex + chunkSize - 1)
    const events = await this.transcriptStreamService.getEventsInRange({
      sessionId,
      startEventIndex,
      endEventIndex: maxEnd,
    })

    const selected = this.selectContiguousEvents({
      events,
      startEventIndex,
      maxCount: chunkSize,
      allowPartial,
      requireFinal: this.shouldRequireFinal(),
    })

    if (!selected) {
      return { processed: false, requeue: false }
    }

    const chunkStart = selected[0].eventIndex
    const chunkEnd = selected[selected.length - 1].eventIndex

    await this.markChunkProcessing(sessionId, chunkStart, chunkEnd)

    try {
      const { dialogues, modelUsed } = await this.analyzeEvents({
        sessionId,
        events: selected,
        startEventIndex: chunkStart,
        endEventIndex: chunkEnd,
      })

      await this.markChunkCompleted({
        sessionId,
        startEventIndex: chunkStart,
        endEventIndex: chunkEnd,
        dialogues,
        modelUsed,
      })

      await this.updateLastAnalyzedIndex(sessionId, chunkEnd)

      const requeue = selected.length >= chunkSize && maxAvailable > chunkEnd
      return { processed: true, requeue }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.markChunkFailed(sessionId, chunkStart, chunkEnd, message)
      return { processed: false, requeue: false }
    }
  }

  private async analyzeEvents(input: {
    sessionId: string
    events: TranscriptEventDTO[]
    startEventIndex: number
    endEventIndex: number
  }): Promise<{ dialogues: TranscriptDialogue[]; modelUsed: 'glm' | 'heuristic' }> {
    const prompt = buildTranscriptAnalysisPrompt({
      sessionId: input.sessionId,
      startEventIndex: input.startEventIndex,
      endEventIndex: input.endEventIndex,
      events: input.events,
    })

    const maxAttempts = 2
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const raw = await this.glmClient.generateStructuredJson(prompt)
        const parsed = parseTranscriptAnalysisJson(raw)
        return {
          dialogues: validateAndNormalizeDialogues({
            events: input.events,
            startEventIndex: input.startEventIndex,
            endEventIndex: input.endEventIndex,
            dialogues: parsed.dialogues,
          }),
          modelUsed: 'glm',
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error(
          `GLM analysis failed, sessionId=${input.sessionId}, attempt=${attempt}/${maxAttempts}: ${message}`,
          error instanceof Error ? error.stack : undefined
        )
      }
    }

    this.logger.warn(`GLM analysis fallback to heuristic, sessionId=${input.sessionId}`)
    return {
      dialogues: heuristicDialoguesBySpeaker({
        events: input.events,
        startEventIndex: input.startEventIndex,
        endEventIndex: input.endEventIndex,
      }),
      modelUsed: 'heuristic',
    }
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

  private async markChunkProcessing(
    sessionId: string,
    startEventIndex: number,
    endEventIndex: number
  ): Promise<void> {
    await this.chunkModel
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
  }

  private async markChunkCompleted(input: {
    sessionId: string
    startEventIndex: number
    endEventIndex: number
    dialogues: TranscriptDialogue[]
    modelUsed: 'glm' | 'heuristic'
  }): Promise<void> {
    await this.chunkModel
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
  }

  private async markChunkFailed(
    sessionId: string,
    startEventIndex: number,
    endEventIndex: number,
    error: string
  ): Promise<void> {
    await this.chunkModel
      .findOneAndUpdate(
        { sessionId, startEventIndex, endEventIndex },
        { $set: { status: 'failed', error } },
        { new: true }
      )
      .exec()
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

  private selectContiguousEvents(input: {
    events: TranscriptEventDTO[]
    startEventIndex: number
    maxCount: number
    allowPartial: boolean
    requireFinal: boolean
  }): TranscriptEventDTO[] | null {
    if (!input.events.length) return null

    const selected: TranscriptEventDTO[] = []
    let expected = input.startEventIndex

    for (const event of input.events) {
      if (event.eventIndex !== expected) {
        break
      }
      if (input.requireFinal && !event.isFinal) {
        break
      }
      selected.push(event)
      expected += 1
      if (selected.length >= input.maxCount) {
        break
      }
    }

    if (!input.allowPartial && selected.length < input.maxCount) {
      return null
    }
    if (selected.length === 0) {
      return null
    }
    return selected
  }

  private readChunkSize(): number {
    const raw =
      this.configService.get<string>('TRANSCRIPT_ANALYSIS_CHUNK_SIZE') ||
      process.env.TRANSCRIPT_ANALYSIS_CHUNK_SIZE
    const value = Number(raw)
    if (!Number.isFinite(value)) return 20
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
    const raw =
      (this.configService.get<string>('TRANSCRIPT_ANALYSIS_REQUIRE_FINAL') ||
        process.env.TRANSCRIPT_ANALYSIS_REQUIRE_FINAL ||
        '')
        .trim()
        .toLowerCase()
    return raw === '1' || raw === 'true'
  }
}
