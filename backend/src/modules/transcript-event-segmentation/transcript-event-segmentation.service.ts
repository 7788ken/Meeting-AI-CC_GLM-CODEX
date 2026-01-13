import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import { TranscriptStreamService } from '../transcript-stream/transcript-stream.service'
import type { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'
import { DebugErrorService } from '../debug-error/debug-error.service'
import { TranscriptEventSegmentationGlmClient } from './transcript-event-segmentation.glm-client'
import { buildTranscriptEventSegmentationPrompt } from './transcript-event-segmentation.prompt'
import { parseTranscriptEventSegmentJson } from './transcript-event-segmentation.validation'
import {
  TranscriptEventSegment,
  TranscriptEventSegmentDocument,
} from './schemas/transcript-event-segment.schema'

export type TranscriptEventSegmentDTO = {
  id: string
  sessionId: string
  sequence: number
  content: string
  sourceStartEventIndex: number
  sourceEndEventIndex: number
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
type PersistedTranscriptEventSegment = {
  dto: TranscriptEventSegmentDTO
  createdId: TranscriptEventSegmentDocument['_id']
}

@Injectable()
export class TranscriptEventSegmentationService {
  private readonly logger = new Logger(TranscriptEventSegmentationService.name)
  private onSegmentUpdate?: TranscriptEventSegmentUpdateHandler
  private onSegmentReset?: TranscriptEventSegmentResetHandler
  private readonly rebuildInFlightBySession = new Set<string>()

  constructor(
    @InjectModel(TranscriptEventSegment.name)
    private readonly segmentModel: Model<TranscriptEventSegmentDocument>,
    private readonly transcriptStreamService: TranscriptStreamService,
    private readonly glmClient: TranscriptEventSegmentationGlmClient,
    private readonly debugErrorService: DebugErrorService,
    private readonly configService: ConfigService
  ) {}

  setOnSegmentUpdate(handler?: TranscriptEventSegmentUpdateHandler | null): void {
    this.onSegmentUpdate = handler ?? undefined
  }

  setOnSegmentReset(handler?: TranscriptEventSegmentResetHandler | null): void {
    this.onSegmentReset = handler ?? undefined
  }

  isRebuildInFlight(sessionId: string): boolean {
    const normalized = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!normalized) return false
    return this.rebuildInFlightBySession.has(normalized)
  }

  async getSnapshot(sessionId: string): Promise<TranscriptEventSegmentsSnapshotDTO> {
    const segments = await this.segmentModel
      .find({ sessionId })
      .sort({ sequence: -1 })
      .exec()

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

    const lastSegment = await this.segmentModel
      .findOne({ sessionId })
      .sort({ sequence: -1 })
      .exec()

    if (!input.force && lastSegment && lastSegment.sourceRevision >= state.revision) {
      return null
    }

    const windowSize = this.readChunkSize()
    const startEventIndex = Math.max(0, endEventIndex - windowSize + 1)
    const events = await this.transcriptStreamService.getEventsInRange({
      sessionId,
      startEventIndex,
      endEventIndex,
    })
    if (!events.length) return null

    const modelName = this.readModelName()

    const nextSequence = (lastSegment?.sequence ?? 0) + 1
    const created = await this.generateAndPersistSegment({
      sessionId,
      previousSentence: lastSegment?.content ?? '',
      prevSegmentId: lastSegment?._id,
      nextSequence,
      sourceStartEventIndex: startEventIndex,
      sourceEndEventIndex: endEventIndex,
      sourceRevision: state.revision,
      events,
      modelName,
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

  private toDTO(segment: TranscriptEventSegmentDocument): TranscriptEventSegmentDTO {
    return {
      id: segment._id.toString(),
      sessionId: segment.sessionId,
      sequence: segment.sequence,
      content: segment.content,
      sourceStartEventIndex: segment.sourceStartEventIndex,
      sourceEndEventIndex: segment.sourceEndEventIndex,
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
    const raw =
      this.configService.get<string>('TRANSCRIPT_EVENTS_SEGMENT_CHUNK_SIZE') ||
      process.env.TRANSCRIPT_EVENTS_SEGMENT_CHUNK_SIZE ||
      this.configService.get<string>('TRANSCRIPT_ANALYSIS_CHUNK_SIZE') ||
      process.env.TRANSCRIPT_ANALYSIS_CHUNK_SIZE ||
      this.configService.get<string>('TRANSCRIPT_ANALYSIS_WINDOW_SIZE') ||
      process.env.TRANSCRIPT_ANALYSIS_WINDOW_SIZE ||
      this.configService.get<string>('TRANSCRIPT_EVENTS_SEGMENT_WINDOW_EVENTS') ||
      process.env.TRANSCRIPT_EVENTS_SEGMENT_WINDOW_EVENTS
    const value = Number(raw)
    if (!Number.isFinite(value)) return 120
    return Math.max(5, Math.min(2000, Math.floor(value)))
  }

  private readModelName(): string {
    const raw = (process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL || '').trim()
    return raw || 'glm-4.6v-flash'
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
    previousSentence: string
    prevSegmentId?: TranscriptEventSegmentDocument['_id']
    nextSequence: number
    sourceStartEventIndex: number
    sourceEndEventIndex: number
    sourceRevision: number
    events: TranscriptEventDTO[]
    modelName: string
  }): Promise<PersistedTranscriptEventSegment | null> {
    const prompt = buildTranscriptEventSegmentationPrompt({
      sessionId: input.sessionId,
      previousSentence: input.previousSentence,
      startEventIndex: input.sourceStartEventIndex,
      endEventIndex: input.sourceEndEventIndex,
      events: input.events,
    })
    const promptLength = prompt.system.length + prompt.user.length

    try {
      const raw = await this.glmClient.generateStructuredJson(prompt)
      const parsed = parseTranscriptEventSegmentJson(raw)

      const created = await this.segmentModel.create({
        sessionId: input.sessionId,
        sequence: input.nextSequence,
        content: parsed.nextSentence,
        sourceStartEventIndex: input.sourceStartEventIndex,
        sourceEndEventIndex: input.sourceEndEventIndex,
        sourceRevision: input.sourceRevision,
        prevSegmentId: input.prevSegmentId,
        status: 'completed',
        model: input.modelName,
        generatedAt: new Date(),
      })

      const dto = this.toDTO(created)
      this.emitSegmentUpdate(dto)
      return { dto, createdId: created._id }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(
        `Transcript event segmentation failed, sessionId=${input.sessionId}: ${message}`
      )
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
    const modelName = this.readModelName()

    let previousSentence = ''
    let prevSegmentId: TranscriptEventSegmentDocument['_id'] | undefined
    let nextSequence = 1

    const maxEvents = 2000
    const cappedEnd = Math.min(endEventIndex, maxEvents - 1)
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

      const created = await this.generateAndPersistSegment({
        sessionId,
        previousSentence,
        prevSegmentId,
        nextSequence,
        sourceStartEventIndex: currentStart,
        sourceEndEventIndex: currentEnd,
        sourceRevision: state.revision,
        events,
        modelName,
      })

      if (!created) {
        continue
      }

      previousSentence = created.dto.content
      prevSegmentId = created.createdId
      nextSequence += 1
    }

    if (endEventIndex >= maxEvents) {
      this.logger.warn(
        `Transcript event segmentation rebuild capped at ${maxEvents} events, sessionId=${sessionId}, endEventIndex=${endEventIndex}`
      )
    }

    this.logger.log(`Transcript event segmentation rebuild completed, sessionId=${sessionId}`)
  }
}
