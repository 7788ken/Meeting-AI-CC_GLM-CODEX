import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { TranscriptEvent, TranscriptEventDocument } from './schemas/transcript-event.schema'
import { TranscriptState, TranscriptStateDocument } from './schemas/transcript-state.schema'

export type TranscriptEventDTO = {
  eventIndex: number
  speakerId: string
  speakerName: string
  content: string
  isFinal: boolean
  segmentKey?: string
  asrTimestampMs?: number
}

export type TranscriptStreamSnapshotDTO = {
  sessionId: string
  revision: number
  nextEventIndex: number
  events: TranscriptEventDTO[]
}

export type TranscriptStreamStateDTO = {
  sessionId: string
  revision: number
  nextEventIndex: number
  lastSegmentedRevision: number
}

@Injectable()
export class TranscriptStreamService {
  constructor(
    @InjectModel(TranscriptEvent.name)
    private readonly eventModel: Model<TranscriptEventDocument>,
    @InjectModel(TranscriptState.name)
    private readonly stateModel: Model<TranscriptStateDocument>
  ) {}

  /**
   * Upsert 一条事件：
   * - eventIndex 未提供：分配新的 eventIndex（nextEventIndex++）
   * - eventIndex 已提供：更新指定 eventIndex（revision++）
   */
  async upsertEvent(input: {
    sessionId: string
    eventIndex?: number
    speakerId: string
    speakerName: string
    content: string
    isFinal: boolean
    segmentKey?: string
    asrTimestampMs?: number
  }): Promise<{ sessionId: string; revision: number; event: TranscriptEventDTO }> {
    const needsNewIndex = input.eventIndex == null
    const stateUpdate = needsNewIndex
      ? { $inc: { revision: 1, nextEventIndex: 1 } }
      : { $inc: { revision: 1 } }

    const state = await this.stateModel.findOneAndUpdate(
      { sessionId: input.sessionId },
      stateUpdate,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    const assignedEventIndex = needsNewIndex
      ? Math.max(0, state.nextEventIndex - 1)
      : input.eventIndex!

    const eventDoc = await this.eventModel.findOneAndUpdate(
      { sessionId: input.sessionId, eventIndex: assignedEventIndex },
      {
        $set: {
          speakerId: input.speakerId,
          speakerName: input.speakerName,
          content: input.content,
          isFinal: input.isFinal,
          segmentKey: input.segmentKey,
          asrTimestampMs: input.asrTimestampMs,
        },
        $setOnInsert: {
          sessionId: input.sessionId,
          eventIndex: assignedEventIndex,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    return {
      sessionId: input.sessionId,
      revision: state.revision,
      event: this.toEventDTO(eventDoc),
    }
  }

  async getSnapshot(input: {
    sessionId: string
    limit?: number
  }): Promise<TranscriptStreamSnapshotDTO> {
    const limit = this.normalizeLimit(input.limit)

    const [state, events] = await Promise.all([
      this.stateModel.findOne({ sessionId: input.sessionId }).exec(),
      this.eventModel
        .find({ sessionId: input.sessionId })
        .sort({ eventIndex: 1 })
        .limit(limit)
        .exec(),
    ])

    return {
      sessionId: input.sessionId,
      revision: state?.revision ?? 0,
      nextEventIndex: state?.nextEventIndex ?? 0,
      events: events.map(e => this.toEventDTO(e)),
    }
  }

  async getState(input: { sessionId: string }): Promise<TranscriptStreamStateDTO> {
    const state = await this.stateModel.findOne({ sessionId: input.sessionId }).exec()

    return {
      sessionId: input.sessionId,
      revision: state?.revision ?? 0,
      nextEventIndex: state?.nextEventIndex ?? 0,
      lastSegmentedRevision: state?.lastSegmentedRevision ?? 0,
    }
  }

  async updateLastSegmentedRevision(input: { sessionId: string; revision: number }): Promise<void> {
    await this.stateModel
      .findOneAndUpdate(
        { sessionId: input.sessionId },
        { $set: { lastSegmentedRevision: Math.max(0, Math.floor(input.revision)) } },
        { upsert: true, setDefaultsOnInsert: true }
      )
      .exec()
  }

  async getEventsInRange(input: {
    sessionId: string
    startEventIndex: number
    endEventIndex: number
  }): Promise<TranscriptEventDTO[]> {
    const start = Math.max(0, Math.floor(input.startEventIndex))
    const end = Math.max(start, Math.floor(input.endEventIndex))

    const docs = await this.eventModel
      .find({
        sessionId: input.sessionId,
        eventIndex: { $gte: start, $lte: end },
      })
      .sort({ eventIndex: 1 })
      .exec()

    return docs.map(d => this.toEventDTO(d))
  }

  private toEventDTO(doc: TranscriptEventDocument): TranscriptEventDTO {
    return {
      eventIndex: doc.eventIndex,
      speakerId: doc.speakerId,
      speakerName: doc.speakerName,
      content: doc.content,
      isFinal: Boolean(doc.isFinal),
      segmentKey: doc.segmentKey ?? undefined,
      asrTimestampMs: doc.asrTimestampMs ?? undefined,
    }
  }

  private normalizeLimit(raw?: number): number {
    if (raw == null) return 2000
    const value = Number(raw)
    if (!Number.isFinite(value)) return 2000
    return Math.max(1, Math.min(5000, Math.floor(value)))
  }
}
