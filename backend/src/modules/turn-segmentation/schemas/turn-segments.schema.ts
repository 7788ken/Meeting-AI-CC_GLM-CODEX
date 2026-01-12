import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type TurnSegmentsDocument = TurnSegments & Document

@Schema({ _id: false })
export class TurnSegmentRange {
  @Prop({ required: true })
  speakerId: string

  @Prop({ required: true })
  speakerName: string

  @Prop({ required: true })
  startEventIndex: number

  @Prop({ required: true })
  endEventIndex: number
}

export const TurnSegmentRangeSchema = SchemaFactory.createForClass(TurnSegmentRange)

/**
 * 轮次分段结果：
 * - segments 只保存范围，不保存内容（原文以 transcript_events 为准）
 * - revision：最后一次成功分段对应的 transcript_state.revision
 * - targetRevision：最近一次尝试分段的 revision（processing/failed 也会更新）
 */
@Schema({
  timestamps: true,
  collection: 'turn_segments',
})
export class TurnSegments {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string

  @Prop({ default: 0 })
  revision: number

  @Prop({ default: 0 })
  targetRevision: number

  @Prop({ default: 'completed' })
  status: 'processing' | 'completed' | 'failed'

  @Prop({ type: [TurnSegmentRangeSchema], default: [] })
  segments: TurnSegmentRange[]

  @Prop()
  error?: string

  @Prop()
  model?: string

  @Prop()
  generatedAt?: Date
}

export const TurnSegmentsSchema = SchemaFactory.createForClass(TurnSegments)

TurnSegmentsSchema.index({ sessionId: 1 }, { unique: true })
TurnSegmentsSchema.index({ sessionId: 1, revision: -1 })

