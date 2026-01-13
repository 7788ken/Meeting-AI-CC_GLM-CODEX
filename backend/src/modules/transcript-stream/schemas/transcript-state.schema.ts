import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type TranscriptStateDocument = TranscriptState & Document

/**
 * 会话级状态：维护 nextEventIndex/revision，支持幂等与恢复
 */
@Schema({
  timestamps: true,
  collection: 'transcript_state',
})
export class TranscriptState {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string

  @Prop({ default: 0 })
  nextEventIndex: number

  @Prop({ default: 0 })
  revision: number

  @Prop({ default: 0 })
  lastSegmentedRevision: number
}

export const TranscriptStateSchema = SchemaFactory.createForClass(TranscriptState)

TranscriptStateSchema.index({ sessionId: 1 }, { unique: true })
