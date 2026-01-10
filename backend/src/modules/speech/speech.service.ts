import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Speech, SpeechDocument } from './schemas/speech.schema'
import { CreateSpeechDto, UpdateSpeechDto, SpeechDto } from './dto/speech.dto'

/**
 * 发言记录服务 (B1027)
 * 使用 Mongoose 实现发言记录的持久化
 */
@Injectable()
export class SpeechService {
  constructor(@InjectModel(Speech.name) private speechModel: Model<SpeechDocument>) {}

  /**
   * 创建发言记录
   */
  async create(dto: CreateSpeechDto): Promise<SpeechDto> {
    const now = new Date()
    const speech = new this.speechModel({
      sessionId: dto.sessionId,
      speakerId: dto.speakerId,
      speakerName: dto.speakerName,
      speakerColor: dto.speakerColor,
      content: dto.content,
      confidence: dto.confidence ?? 0,
      startTime: now,
      endTime: now,
      duration: 0,
      isEdited: false,
      isMarked: false,
      audioOffset: dto.audioOffset,
    })

    const saved = await speech.save()
    return this.toDto(saved)
  }

  /**
   * 查询单条发言记录
   */
  async findOne(id: string): Promise<SpeechDto> {
    const speech = await this.speechModel.findById(id)
    if (!speech) {
      throw new NotFoundException(`Speech ${id} not found`)
    }
    return this.toDto(speech)
  }

  /**
   * 查询会话的所有发言记录
   */
  async findBySession(sessionId: string): Promise<SpeechDto[]> {
    const speeches = await this.speechModel.find({ sessionId }).sort({ startTime: 1 }).exec()

    return speeches.map(s => this.toDto(s))
  }

  /**
   * 查询发言者的所有发言记录
   */
  async findBySpeaker(sessionId: string, speakerId: string): Promise<SpeechDto[]> {
    const speeches = await this.speechModel
      .find({ sessionId, speakerId })
      .sort({ startTime: 1 })
      .exec()

    return speeches.map(s => this.toDto(s))
  }

  /**
   * 更新发言记录
   */
  async update(id: string, dto: UpdateSpeechDto): Promise<SpeechDto> {
    const speech = await this.speechModel.findById(id)
    if (!speech) {
      throw new NotFoundException(`Speech ${id} not found`)
    }

    // 如果编辑内容，标记为已编辑
    if (dto.content !== undefined && dto.content !== speech.content) {
      speech.isEdited = true
      speech.editedAt = new Date()
    }

    Object.assign(speech, dto)
    const updated = await speech.save()
    return this.toDto(updated)
  }

  /**
   * 搜索发言记录 (B1030)
   */
  async search(sessionId: string, keyword: string): Promise<SpeechDto[]> {
    const speeches = await this.speechModel
      .find({
        sessionId,
        content: { $regex: keyword, $options: 'i' },
      })
      .sort({ startTime: 1 })
      .exec()

    return speeches.map(s => this.toDto(s))
  }

  /**
   * 标记/取消标记发言记录
   */
  async toggleMark(id: string, marked: boolean, reason?: string): Promise<SpeechDto> {
    const speech = await this.speechModel.findById(id)
    if (!speech) {
      throw new NotFoundException(`Speech ${id} not found`)
    }

    speech.isMarked = marked
    speech.markReason = reason

    const updated = await speech.save()
    return this.toDto(updated)
  }

  /**
   * 批量保存发言记录
   */
  async batchCreate(dtos: CreateSpeechDto[]): Promise<SpeechDto[]> {
    const now = new Date()
    const speeches = dtos.map(dto => ({
      sessionId: dto.sessionId,
      speakerId: dto.speakerId,
      speakerName: dto.speakerName,
      speakerColor: dto.speakerColor,
      content: dto.content,
      confidence: dto.confidence ?? 0,
      startTime: now,
      endTime: now,
      duration: 0,
      isEdited: false,
      isMarked: false,
      audioOffset: dto.audioOffset,
    }))

    const saved = await this.speechModel.insertMany(speeches)
    return saved.map(s => this.toDto(s))
  }

  /**
   * 删除会话的所有发言记录
   */
  async deleteBySession(sessionId: string): Promise<void> {
    await this.speechModel.deleteMany({ sessionId }).exec()
  }

  /**
   * 转换为 DTO
   */
  private toDto(speech: SpeechDocument): SpeechDto {
    return {
      id: speech._id.toString(),
      sessionId: speech.sessionId,
      speakerId: speech.speakerId,
      speakerName: speech.speakerName,
      speakerColor: speech.speakerColor,
      content: speech.content,
      confidence: speech.confidence,
      startTime: speech.startTime,
      endTime: speech.endTime,
      duration: speech.duration ?? 0,
      isEdited: speech.isEdited,
      isMarked: speech.isMarked,
      audioOffset: speech.audioOffset,
    }
  }
}
