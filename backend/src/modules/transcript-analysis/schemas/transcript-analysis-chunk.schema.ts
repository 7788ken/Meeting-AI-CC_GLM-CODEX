import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type TranscriptAnalysisChunkDocument = TranscriptAnalysisChunk & Document

export class TranscriptDialogue {
  @Prop({ required: true })
  speakerId: string

  @Prop({ required: true })
  speakerName: string

  @Prop({ required: true })
  startEventIndex: number

  @Prop({ required: true })
  endEventIndex: number

  @Prop({ required: true })
  content: string

  @Prop()
  correctedContent?: string // GLM 纠正后的内容；如果 GLM 未返回则为 undefined
}

export const TranscriptDialogueSchema = SchemaFactory.createForClass(TranscriptDialogue)

@Schema({
  timestamps: true,
  collection: 'transcript_analysis_chunks',
})
export class TranscriptAnalysisChunk {
  @Prop({ required: true, index: true })
  sessionId: string

  @Prop({ required: true })
  startEventIndex: number

  @Prop({ required: true })
  endEventIndex: number

  @Prop({ required: true, enum: ['processing', 'completed', 'failed'], default: 'processing' })
  status: 'processing' | 'completed' | 'failed'

  @Prop({ type: [TranscriptDialogueSchema], default: [] })
  dialogues: TranscriptDialogue[]

  @Prop()
  error?: string

  @Prop()
  model?: string

  @Prop()
  generatedAt?: Date
}

export const TranscriptAnalysisChunkSchema = SchemaFactory.createForClass(TranscriptAnalysisChunk)

TranscriptAnalysisChunkSchema.index(
  { sessionId: 1, startEventIndex: 1, endEventIndex: 1 },
  { unique: true }
)
