import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type TranscriptEventSegmentDocument = TranscriptEventSegment & Document

@Schema({
  timestamps: true,
  collection: 'transcript_events_segments',
})
export class TranscriptEventSegment {
  @Prop({ required: true, index: true })
  sessionId: string

  @Prop({ required: true })
  sequence: number

  @Prop({ required: true })
  content: string

  @Prop({ required: true })
  sourceStartEventIndex: number

  @Prop({ required: true })
  sourceEndEventIndex: number

  @Prop()
  sourceStartEventIndexExact?: number

  @Prop()
  sourceStartEventOffset?: number

  @Prop()
  sourceEndEventIndexExact?: number

  @Prop()
  sourceEndEventOffset?: number

  @Prop({ required: true })
  sourceRevision: number

  @Prop({ type: Types.ObjectId })
  prevSegmentId?: Types.ObjectId

  @Prop({ required: true, enum: ['completed', 'failed'], default: 'completed' })
  status: 'completed' | 'failed'

  @Prop()
  error?: string

  @Prop()
  model?: string

  @Prop()
  promptSystem?: string

  @Prop()
  promptUser?: string

  @Prop()
  promptLength?: number

  @Prop()
  generatedAt?: Date

  @Prop()
  createdAt?: Date

  @Prop()
  updatedAt?: Date
}

export const TranscriptEventSegmentSchema = SchemaFactory.createForClass(TranscriptEventSegment)

TranscriptEventSegmentSchema.index({ sessionId: 1, sequence: 1 }, { unique: true })
TranscriptEventSegmentSchema.index({ sessionId: 1, sourceRevision: -1 })
