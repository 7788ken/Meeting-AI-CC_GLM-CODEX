import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema, Types } from 'mongoose'

/**
 * AI 分析 Mongoose 模型 (B1011)
 * 用于存储 AI 分析结果
 */

export type AnalysisDocument = Analysis & Document

@Schema({
  timestamps: true,
  collection: 'analysis',
})
export class Analysis {
  @Prop({ required: true, index: true })
  sessionId: string

  @Prop({
    required: true,
    enum: ['summary', 'action-items', 'sentiment', 'keywords', 'topics', 'full-report'],
  })
  analysisType: string

  @Prop({ required: true })
  modelUsed: string

  @Prop({ required: true })
  modelVersion: string

  @Prop({ required: true })
  result: string // 分析结果文本

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown> // 额外的元数据

  @Prop({ default: 'pending' })
  status: 'pending' | 'processing' | 'completed' | 'failed'

  @Prop()
  errorMessage?: string

  @Prop()
  processingTime?: number // 处理耗时（毫秒）

  @Prop({ default: false })
  isCached: boolean

  @Prop()
  cachedAt?: Date

  @Prop({ type: [Types.ObjectId], ref: 'Speech', default: [] })
  relatedSpeeches: Types.ObjectId[] // 关联的发言记录

  @Prop()
  generatedAt?: Date // 分析生成时间

  @Prop()
  createdAt?: Date

  @Prop()
  updatedAt?: Date
}

export const AnalysisSchema = SchemaFactory.createForClass(Analysis)

// 索引优化
AnalysisSchema.index({ sessionId: 1, analysisType: 1 })
AnalysisSchema.index({ status: 1 })
AnalysisSchema.index({ createdAt: -1 })
