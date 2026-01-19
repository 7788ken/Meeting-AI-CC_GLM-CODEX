import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'

@Schema({
  collection: 'transcript_analysis_segment_analyses',
  timestamps: true,
})
export class TranscriptAnalysisSegmentAnalysis {
  @Prop({ required: true, index: true })
  sessionId!: string

  @Prop({ type: Types.ObjectId, required: true, index: true })
  segmentId!: Types.ObjectId

  @Prop({ required: true })
  segmentSequence!: number

  @Prop({ required: true })
  markdown!: string

  @Prop({ required: true })
  model!: string

  @Prop({ required: true })
  generatedAt!: string

  @Prop({ required: true })
  sourceRevision!: number

  @Prop({ required: true })
  sourceStartEventIndex!: number

  @Prop({ required: true })
  sourceEndEventIndex!: number
}

export type TranscriptAnalysisSegmentAnalysisDocument =
  HydratedDocument<TranscriptAnalysisSegmentAnalysis>
export const TranscriptAnalysisSegmentAnalysisSchema = SchemaFactory.createForClass(
  TranscriptAnalysisSegmentAnalysis
)

TranscriptAnalysisSegmentAnalysisSchema.index({ sessionId: 1, segmentId: 1 }, { unique: true })
