import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({
  collection: 'transcript_analysis_summaries',
  timestamps: true,
})
export class TranscriptAnalysisSummary {
  @Prop({ required: true, index: true, unique: true })
  sessionId!: string

  @Prop({ required: true })
  markdown!: string

  @Prop({ required: true })
  model!: string

  @Prop({ required: true })
  generatedAt!: string

  @Prop({ required: true })
  sourceRevision!: number

  @Prop({ required: true })
  sourceEventCount!: number

  @Prop({ required: true, enum: ['single', 'chunked'] })
  mode!: 'single' | 'chunked'
}

export type TranscriptAnalysisSummaryDocument = HydratedDocument<TranscriptAnalysisSummary>
export const TranscriptAnalysisSummarySchema = SchemaFactory.createForClass(TranscriptAnalysisSummary)

