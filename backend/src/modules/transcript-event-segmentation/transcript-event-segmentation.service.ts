import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import { TranscriptStreamService } from '../transcript-stream/transcript-stream.service'
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

@Injectable()
export class TranscriptEventSegmentationService {
  private readonly logger = new Logger(TranscriptEventSegmentationService.name)

  constructor(
    @InjectModel(TranscriptEventSegment.name)
    private readonly segmentModel: Model<TranscriptEventSegmentDocument>,
    private readonly transcriptStreamService: TranscriptStreamService,
    private readonly glmClient: TranscriptEventSegmentationGlmClient,
    private readonly debugErrorService: DebugErrorService,
    private readonly configService: ConfigService,
    @Optional() private readonly onSegmentUpdate?: TranscriptEventSegmentUpdateHandler
  ) {}

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

    const windowSize = this.readWindowSize()
    const startEventIndex = Math.max(0, endEventIndex - windowSize + 1)
    const events = await this.transcriptStreamService.getEventsInRange({
      sessionId,
      startEventIndex,
      endEventIndex,
    })
    if (!events.length) return null

    const prompt = buildTranscriptEventSegmentationPrompt({
      sessionId,
      previousSentence: lastSegment?.content ?? '',
      startEventIndex,
      endEventIndex,
      events,
    })
    const promptLength = prompt.system.length + prompt.user.length
    const modelName = this.readModelName()

    try {
      const raw = await this.glmClient.generateStructuredJson(prompt)
      const parsed = parseTranscriptEventSegmentJson(raw)

      const nextSequence = (lastSegment?.sequence ?? 0) + 1
      const created = await this.segmentModel.create({
        sessionId,
        sequence: nextSequence,
        content: parsed.nextSentence,
        sourceStartEventIndex: startEventIndex,
        sourceEndEventIndex: endEventIndex,
        sourceRevision: state.revision,
        prevSegmentId: lastSegment?._id,
        status: 'completed',
        model: modelName,
        generatedAt: new Date(),
      })

      const dto = this.toDTO(created)
      this.emitSegmentUpdate(dto)
      return dto
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(
        `Transcript event segmentation failed, sessionId=${sessionId}: ${message}`
      )
      void this.debugErrorService.recordError({
        sessionId,
        level: 'error',
        message: `Transcript event segmentation failed: ${message}`,
        source: 'glm-api',
        category: 'transcript-event-segmentation',
        error,
        context: {
          model: modelName,
          promptLength,
          revision: state.revision,
          startEventIndex,
          endEventIndex,
        },
        occurredAt: new Date(),
      })
      return null
    }
  }

  private emitSegmentUpdate(data: TranscriptEventSegmentDTO): void {
    if (!this.onSegmentUpdate) return
    this.onSegmentUpdate(data)
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

  private readWindowSize(): number {
    const raw =
      this.configService.get<string>('TRANSCRIPT_EVENTS_SEGMENT_WINDOW_EVENTS') ??
      process.env.TRANSCRIPT_EVENTS_SEGMENT_WINDOW_EVENTS
    const value = Number(raw)
    if (!Number.isFinite(value)) return 120
    return Math.max(5, Math.min(2000, Math.floor(value)))
  }

  private readModelName(): string {
    const raw = (process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL || '').trim()
    if (raw) return raw
    const fallback = (process.env.GLM_TURN_SEGMENT_MODEL || '').trim()
    return fallback || 'glm-4.6v-flash'
  }
}
