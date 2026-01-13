import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import {
  TurnSegments,
  TurnSegmentsDocument,
  TurnSegmentRange,
} from './schemas/turn-segments.schema'
import { TranscriptStreamService } from '../transcript-stream/transcript-stream.service'
import { TurnSegmentationGlmClient } from './turn-segmentation.glm-client'
import { buildTurnSegmentationPrompt } from './turn-segmentation.prompt'
import {
  heuristicSegmentBySpeaker,
  parseTurnSegmentsJson,
  validateAndNormalizeSegments,
} from './turn-segmentation.validation'
import type { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

export type TurnSegmentsSnapshotDTO = {
  sessionId: string
  revision: number
  targetRevision: number
  status: 'processing' | 'completed' | 'failed'
  segments: TurnSegmentRange[]
  error?: string
  model?: string
  generatedAt?: Date
}

export type TurnSegmentsUpsertDTO = {
  sessionId: string
  revision: number
  status: 'processing' | 'completed' | 'failed'
  segments?: TurnSegmentRange[]
  error?: string
}

@Injectable()
export class TurnSegmentationService {
  private readonly logger = new Logger(TurnSegmentationService.name)

  constructor(
    @InjectModel(TurnSegments.name)
    private readonly turnSegmentsModel: Model<TurnSegmentsDocument>,
    private readonly transcriptStreamService: TranscriptStreamService,
    private readonly glmClient: TurnSegmentationGlmClient,
    private readonly configService: ConfigService
  ) {}

  async getSnapshot(sessionId: string): Promise<TurnSegmentsSnapshotDTO> {
    const doc = await this.getOrCreateDoc(sessionId)
    return this.toSnapshotDTO(doc)
  }

  async markProcessing(input: {
    sessionId: string
    targetRevision: number
  }): Promise<TurnSegmentsUpsertDTO> {
    const targetRevision = Math.max(0, Math.floor(input.targetRevision))

    const doc = await this.turnSegmentsModel
      .findOneAndUpdate(
        { sessionId: input.sessionId },
        {
          $set: {
            targetRevision,
            status: 'processing',
            error: undefined,
          },
          $setOnInsert: { sessionId: input.sessionId, revision: 0, segments: [] },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      .exec()

    return { sessionId: doc.sessionId, revision: targetRevision, status: 'processing' }
  }

  async segmentAndPersist(input: {
    sessionId: string
    targetRevision: number
    forceModel?: 'glm' | 'heuristic'
  }): Promise<TurnSegmentsUpsertDTO> {
    const sessionId = input.sessionId
    const targetRevision = Math.max(0, Math.floor(input.targetRevision))
    const doc = await this.getOrCreateDoc(sessionId)

    if (doc.revision >= targetRevision && doc.status === 'completed') {
      return {
        sessionId,
        revision: targetRevision,
        status: 'completed',
        segments: doc.segments ?? [],
      }
    }

    const state = await this.transcriptStreamService.getState({ sessionId })
    const endEventIndex = Math.max(-1, state.nextEventIndex - 1)

    if (endEventIndex < 0) {
      const updated = await this.turnSegmentsModel
        .findOneAndUpdate(
          { sessionId },
          {
            $set: {
              revision: targetRevision,
              targetRevision,
              status: 'completed',
              segments: [],
              model: input.forceModel ?? 'heuristic',
              generatedAt: new Date(),
              error: undefined,
            },
          },
          { new: true }
        )
        .exec()

      await this.transcriptStreamService.updateLastSegmentedRevision({
        sessionId,
        revision: targetRevision,
      })

      return {
        sessionId,
        revision: targetRevision,
        status: 'completed',
        segments: updated?.segments ?? [],
      }
    }

    const windowSize = this.readWindowSize()

    const existingSegments = Array.isArray(doc.segments) ? doc.segments : []
    let startEventIndex = Math.max(0, endEventIndex - windowSize + 1)
    const aligned = this.alignStartToExistingBoundary(existingSegments, startEventIndex)
    startEventIndex = Math.min(startEventIndex, aligned)

    const events = await this.transcriptStreamService.getEventsInRange({
      sessionId,
      startEventIndex,
      endEventIndex,
    })

    const model = input.forceModel ?? this.pickModel()

    let segmented: TurnSegmentRange[]
    let modelUsed: 'glm' | 'heuristic'
    try {
      const result = await this.segmentRange({
        sessionId,
        targetRevision,
        startEventIndex,
        endEventIndex,
        events,
        model,
      })
      segmented = result.segments
      modelUsed = result.modelUsed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `Turn segmentation failed, sessionId=${sessionId}, rev=${targetRevision}: ${message}`,
        error instanceof Error ? error.stack : undefined
      )

      await this.turnSegmentsModel
        .findOneAndUpdate(
          { sessionId },
          {
            $set: {
              targetRevision,
              status: 'failed',
              error: message,
            },
          },
          { new: true }
        )
        .exec()

      return { sessionId, revision: targetRevision, status: 'failed', error: message }
    }

    const merged = this.mergeSegments(existingSegments, segmented, startEventIndex)

    const updated = await this.turnSegmentsModel
      .findOneAndUpdate(
        { sessionId },
        {
          $set: {
            revision: targetRevision,
            targetRevision,
            status: 'completed',
            segments: merged,
            model: modelUsed,
            generatedAt: new Date(),
            error: undefined,
          },
        },
        { new: true }
      )
      .exec()

    await this.transcriptStreamService.updateLastSegmentedRevision({
      sessionId,
      revision: targetRevision,
    })

    return {
      sessionId,
      revision: targetRevision,
      status: 'completed',
      segments: updated?.segments ?? merged,
    }
  }

  private async getOrCreateDoc(sessionId: string): Promise<TurnSegmentsDocument> {
    const doc = await this.turnSegmentsModel
      .findOneAndUpdate(
        { sessionId },
        {
          $setOnInsert: {
            sessionId,
            revision: 0,
            targetRevision: 0,
            status: 'completed',
            segments: [],
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      .exec()
    return doc
  }

  private toSnapshotDTO(doc: TurnSegmentsDocument): TurnSegmentsSnapshotDTO {
    return {
      sessionId: doc.sessionId,
      revision: doc.revision ?? 0,
      targetRevision: doc.targetRevision ?? 0,
      status: doc.status ?? 'completed',
      segments: doc.segments ?? [],
      error: doc.error ?? undefined,
      model: doc.model ?? undefined,
      generatedAt: doc.generatedAt ?? undefined,
    }
  }

  private readWindowSize(): number {
    const raw =
      this.configService.get<string>('TRANSCRIPT_SEGMENT_WINDOW_EVENTS') ??
      process.env.TRANSCRIPT_SEGMENT_WINDOW_EVENTS
    const value = Number(raw)
    if (!Number.isFinite(value)) return 120
    return Math.max(20, Math.min(2000, Math.floor(value)))
  }

  private pickModel(): 'glm' | 'heuristic' {
    const raw = (process.env.TRANSCRIPT_SEGMENT_MODEL || '').trim().toLowerCase()
    if (raw === 'heuristic') return 'heuristic'
    return 'glm'
  }

  private alignStartToExistingBoundary(
    segments: TurnSegmentRange[],
    startEventIndex: number
  ): number {
    for (const seg of segments) {
      if (seg.startEventIndex <= startEventIndex && startEventIndex <= seg.endEventIndex) {
        return seg.startEventIndex
      }
    }
    return startEventIndex
  }

  private mergeSegments(
    existingSegments: TurnSegmentRange[],
    newSegments: TurnSegmentRange[],
    startEventIndex: number
  ): TurnSegmentRange[] {
    const prefix = existingSegments.filter(s => s.endEventIndex < startEventIndex)
    return [...prefix, ...newSegments]
  }

  private async segmentRange(input: {
    sessionId: string
    targetRevision: number
    startEventIndex: number
    endEventIndex: number
    events: TranscriptEventDTO[]
    model: 'glm' | 'heuristic'
  }): Promise<{ segments: TurnSegmentRange[]; modelUsed: 'glm' | 'heuristic' }> {
    if (input.model === 'heuristic') {
      return {
        segments: heuristicSegmentBySpeaker({
          events: input.events,
          startEventIndex: input.startEventIndex,
          endEventIndex: input.endEventIndex,
        }),
        modelUsed: 'heuristic',
      }
    }

    const apiKey = (this.configService.get<string>('GLM_API_KEY') || '').trim()
    if (!apiKey) {
      return {
        segments: heuristicSegmentBySpeaker({
          events: input.events,
          startEventIndex: input.startEventIndex,
          endEventIndex: input.endEventIndex,
        }),
        modelUsed: 'heuristic',
      }
    }

    const prompt = buildTurnSegmentationPrompt({
      sessionId: input.sessionId,
      targetRevision: input.targetRevision,
      startEventIndex: input.startEventIndex,
      endEventIndex: input.endEventIndex,
      events: input.events,
    })

    const maxAttempts = 2
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const raw = await this.glmClient.generateStructuredJson(prompt)
        const parsed = parseTurnSegmentsJson(raw)
        return {
          segments: validateAndNormalizeSegments({
            events: input.events,
            startEventIndex: input.startEventIndex,
            endEventIndex: input.endEventIndex,
            segments: parsed.segments,
          }),
          modelUsed: 'glm',
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error(
          `GLM segmentation failed, sessionId=${input.sessionId}, rev=${input.targetRevision}, attempt=${attempt}/${maxAttempts}: ${message}`,
          error instanceof Error ? error.stack : undefined
        )
      }
    }

    this.logger.warn(
      `GLM segmentation fallback to heuristic, sessionId=${input.sessionId}, rev=${input.targetRevision}`
    )
    return {
      segments: heuristicSegmentBySpeaker({
        events: input.events,
        startEventIndex: input.startEventIndex,
        endEventIndex: input.endEventIndex,
      }),
      modelUsed: 'heuristic',
    }
  }
}
