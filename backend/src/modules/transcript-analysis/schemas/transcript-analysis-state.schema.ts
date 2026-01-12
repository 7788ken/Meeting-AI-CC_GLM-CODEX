import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type TranscriptAnalysisStateDocument = TranscriptAnalysisState & Document

@Schema({
  timestamps: true,
  collection: 'transcript_analysis_state',
})
export class TranscriptAnalysisState {
  @Prop({ required: true, unique: true })
  sessionId: string

  @Prop({ default: -1 })
  lastAnalyzedEventIndex: number

  @Prop()
  pendingRollbackEventIndex?: number
}

export const TranscriptAnalysisStateSchema = SchemaFactory.createForClass(TranscriptAnalysisState)

TranscriptAnalysisStateSchema.index({ sessionId: 1 }, { unique: true })
