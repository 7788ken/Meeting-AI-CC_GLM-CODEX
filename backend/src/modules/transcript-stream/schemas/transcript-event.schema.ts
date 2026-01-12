import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type TranscriptEventDocument = TranscriptEvent & Document

/**
 * 原文事件流：ASR 的“可回写”输出以事件形式落库
 */
@Schema({
  timestamps: true,
  collection: 'transcript_events',
})
export class TranscriptEvent {
  @Prop({ required: true, index: true })
  sessionId: string

  @Prop({ required: true })
  eventIndex: number

  @Prop({ required: true })
  speakerId: string

  @Prop({ required: true })
  speakerName: string

  @Prop({ required: true })
  content: string

  @Prop({ default: false })
  isFinal: boolean

  @Prop()
  segmentKey?: string

  @Prop()
  asrTimestampMs?: number
}

export const TranscriptEventSchema = SchemaFactory.createForClass(TranscriptEvent)

TranscriptEventSchema.index({ sessionId: 1, eventIndex: 1 }, { unique: true })
TranscriptEventSchema.index({ sessionId: 1, segmentKey: 1 })

