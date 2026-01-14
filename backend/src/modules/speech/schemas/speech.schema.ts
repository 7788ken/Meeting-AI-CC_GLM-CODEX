import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

/**
 * 发言记录 Mongoose 模型 (B1010)
 * 用于存储会议中的发言记录
 */

export type SpeechDocument = Speech & Document

@Schema({
  timestamps: true,
  collection: 'speeches',
})
export class Speech {
  @Prop({ required: true, index: true })
  sessionId: string

  @Prop({ required: true })
  content: string

  @Prop()
  confidence?: number

  @Prop({ required: true, index: true })
  startTime: Date

  @Prop({ required: true })
  endTime: Date

  @Prop({ default: false })
  isEdited: boolean

  @Prop()
  editedBy?: string

  @Prop()
  editedAt?: Date

  @Prop({ default: false })
  isMarked: boolean

  @Prop()
  markReason?: string

  @Prop()
  audioOffset?: number // 音频偏移量（毫秒）

  @Prop()
  duration?: number // 发言时长（毫秒）
}

export const SpeechSchema = SchemaFactory.createForClass(Speech)

// 索引优化
SpeechSchema.index({ sessionId: 1, startTime: 1 })
