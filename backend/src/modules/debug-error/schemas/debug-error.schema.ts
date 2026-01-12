import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema } from 'mongoose'

/**
 * 会话调试错误模型
 * 用于存储会话级别的报错信息
 */

export type DebugErrorDocument = DebugError & Document

@Schema({
  timestamps: true,
  collection: 'debug_errors',
})
export class DebugError {
  @Prop({ required: true, index: true })
  sessionId: string

  @Prop({ required: true })
  message: string

  @Prop({ default: 'error', enum: ['info', 'warn', 'error', 'fatal'] })
  level: 'info' | 'warn' | 'error' | 'fatal'

  @Prop()
  source?: string

  @Prop()
  category?: string

  @Prop()
  errorCode?: string

  @Prop()
  stack?: string

  @Prop({ type: MongooseSchema.Types.Mixed })
  context?: Record<string, unknown>

  @Prop()
  occurredAt?: Date

  @Prop()
  createdAt?: Date

  @Prop()
  updatedAt?: Date
}

export const DebugErrorSchema = SchemaFactory.createForClass(DebugError)

DebugErrorSchema.index({ sessionId: 1, createdAt: -1 })
DebugErrorSchema.index({ level: 1, createdAt: -1 })
