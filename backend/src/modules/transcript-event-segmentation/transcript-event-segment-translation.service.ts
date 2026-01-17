import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { AppConfigService } from '../app-config/app-config.service'
import {
  TranscriptEventSegment,
  TranscriptEventSegmentDocument,
} from './schemas/transcript-event-segment.schema'
import type { TranscriptEventSegmentDTO } from './transcript-event-segmentation.service'
import { TranscriptEventSegmentTranslationGlmClient } from './transcript-event-segment-translation.glm-client'

type TranscriptEventSegmentUpsertHandler = (data: TranscriptEventSegmentDTO) => void

@Injectable()
export class TranscriptEventSegmentTranslationService {
  private readonly logger = new Logger(TranscriptEventSegmentTranslationService.name)
  private onSegmentUpsert?: TranscriptEventSegmentUpsertHandler
  private readonly inFlight = new Set<string>()

  constructor(
    @InjectModel(TranscriptEventSegment.name)
    private readonly segmentModel: Model<TranscriptEventSegmentDocument>,
    private readonly appConfigService: AppConfigService,
    private readonly glmClient: TranscriptEventSegmentTranslationGlmClient
  ) {}

  setOnSegmentUpsert(handler?: TranscriptEventSegmentUpsertHandler | null): void {
    this.onSegmentUpsert = handler ?? undefined
  }

  async translateMissingSegments(sessionId: string, limit = 30): Promise<void> {
    if (!this.isTranslationEnabled()) return
    const normalized = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!normalized) return
    const safeLimit = Math.max(0, Math.floor(limit))
    if (!safeLimit) return

    const candidates = await this.segmentModel
      .find({
        sessionId: normalized,
        $or: [
          { translatedContent: { $exists: false } },
          { translatedContent: null },
          { translatedContent: '' },
        ],
      })
      .sort({ sequence: -1 })
      .limit(safeLimit)
      .exec()

    if (!candidates.length) return

    for (const segment of candidates) {
      const segmentId = segment._id.toString()
      if (!segmentId) continue
      if (this.inFlight.has(segmentId)) continue
      this.inFlight.add(segmentId)
      try {
        await this.translateAndPersist(segmentId)
      } finally {
        this.inFlight.delete(segmentId)
      }
    }
  }

  handleSegmentUpsert(segment: TranscriptEventSegmentDTO): void {
    if (!this.isTranslationEnabled()) return
    const segmentId = typeof segment.id === 'string' ? segment.id.trim() : ''
    if (!segmentId) return
    if (segment.translatedContent && segment.translatedContent.trim()) return
    if (this.inFlight.has(segmentId)) return

    this.inFlight.add(segmentId)
    void this.translateAndPersist(segmentId).finally(() => {
      this.inFlight.delete(segmentId)
    })
  }

  private isTranslationEnabled(): boolean {
    return this.appConfigService.getBoolean('TRANSCRIPT_SEGMENT_TRANSLATION_ENABLED', false)
  }

  private resolveTargetLanguage(): string {
    const raw = this.appConfigService
      .getString('TRANSCRIPT_SEGMENT_TRANSLATION_LANGUAGE', '')
      .trim()
    return raw || '简体中文'
  }

  private toDTO(segment: TranscriptEventSegmentDocument): TranscriptEventSegmentDTO {
    return {
      id: segment._id.toString(),
      sessionId: segment.sessionId,
      sequence: segment.sequence,
      content: segment.content,
      translatedContent: segment.translatedContent,
      translationStatus: segment.translationStatus,
      translationError: segment.translationError,
      translationModel: segment.translationModel,
      translationGeneratedAt: segment.translationGeneratedAt
        ? segment.translationGeneratedAt.toISOString()
        : undefined,
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

  private async translateAndPersist(segmentId: string): Promise<void> {
    const existing = await this.segmentModel.findById(segmentId).exec()
    if (!existing) return

    const sourceText = typeof existing.content === 'string' ? existing.content.trim() : ''
    if (!sourceText) return
    if (existing.translatedContent && existing.translatedContent.trim()) return

    try {
      const targetLanguage = this.resolveTargetLanguage()
      const { translatedText, model } = await this.glmClient.translate(sourceText, targetLanguage, {
        scheduleKey: `translation:${existing.sessionId}`,
      })
      const normalized = translatedText.trim()
      if (!normalized) {
        await this.segmentModel
          .updateOne(
            { _id: existing._id },
            {
              $set: {
                translationStatus: 'failed',
                translationError: '翻译结果为空',
                translationModel: model,
                translationGeneratedAt: new Date(),
              },
            }
          )
          .exec()
        return
      }

      await this.segmentModel
        .updateOne(
          { _id: existing._id },
          {
            $set: {
              translatedContent: normalized,
              translationStatus: 'completed',
              translationError: '',
              translationModel: model,
              translationGeneratedAt: new Date(),
            },
          }
        )
        .exec()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message === 'Superseded by newer request') {
        return
      }
      const trimmed = message.trim()
      const safeMessage = trimmed.length > 300 ? `${trimmed.slice(0, 300)}…(truncated)` : trimmed
      this.logger.warn(`Segment translation failed, segmentId=${segmentId}: ${safeMessage}`)
      await this.segmentModel
        .updateOne(
          { _id: existing._id },
          {
            $set: {
              translationStatus: 'failed',
              translationError: safeMessage,
              translationGeneratedAt: new Date(),
            },
          }
        )
        .exec()
      return
    }

    const updated = await this.segmentModel.findById(segmentId).exec()
    if (!updated) return
    this.onSegmentUpsert?.(this.toDTO(updated))
  }
}
