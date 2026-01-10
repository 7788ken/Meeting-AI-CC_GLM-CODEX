import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Speech, SpeechDocument } from './schemas/speech.schema'
import { SpeechDto } from './dto/speech.dto'

/**
 * 发言者信息接口
 */
export interface SpeakerInfo {
  id: string
  name: string
  color: string
  speechCount: number
  firstSpeakTime: Date
  lastSpeakTime: Date
}

/**
 * 发言者识别服务 (B1020)
 * 提供基础发言者识别和管理功能
 */
@Injectable()
export class SpeakerService {
  // 发言者颜色池（易于区分的颜色）
  private readonly SPEAKER_COLORS = [
    '#1890ff', // 蓝色
    '#52c41a', // 绿色
    '#faad14', // 橙色
    '#f5222d', // 红色
    '#722ed1', // 紫色
    '#eb2f96', // 粉色
    '#13c2c2', // 青色
    '#fa8c16', // 深橙色
    '#a0d911', // 柠檬绿
    '#2f54eb', // 深蓝色
  ]

  private colorIndex = 0

  constructor(
    @InjectModel(Speech.name) private speechModel: Model<SpeechDocument>,
  ) {}

  /**
   * 为新发言分配发言者信息
   * 基础版本：根据发言者名称或 ID 分配颜色
   */
  assignSpeaker(speakerId: string, speakerName?: string): {
    id: string
    name: string
    color: string
  } {
    // 使用 speakerId 作为唯一标识
    const id = speakerId || this.generateSpeakerId()
    const name = speakerName || `发言者 ${id.slice(0, 4)}`
    const color = this.assignColor(id)

    return { id, name, color }
  }

  /**
   * 从现有发言记录中识别发言者
   * 基础版本：根据名称匹配
   */
  async identifySpeaker(
    sessionId: string,
    speakerName: string,
  ): Promise<{ id: string; name: string; color: string } | null> {
    const speech = await this.speechModel
      .findOne({ sessionId, speakerName })
      .sort({ startTime: -1 })
      .exec()

    if (!speech) {
      return null
    }

    return {
      id: speech.speakerId,
      name: speech.speakerName,
      color: speech.speakerColor || this.assignColor(speech.speakerId),
    }
  }

  /**
   * 获取会话的所有发言者
   */
  async getSpeakersBySession(sessionId: string): Promise<SpeakerInfo[]> {
    const speeches = await this.speechModel
      .find({ sessionId })
      .sort({ startTime: 1 })
      .exec()

    const speakerMap = new Map<string, SpeakerInfo>()

    for (const speech of speeches) {
      const speakerId = speech.speakerId

      if (!speakerMap.has(speakerId)) {
        speakerMap.set(speakerId, {
          id: speakerId,
          name: speech.speakerName,
          color: speech.speakerColor,
          speechCount: 0,
          firstSpeakTime: speech.startTime,
          lastSpeakTime: speech.startTime,
        })
      }

      const speaker = speakerMap.get(speakerId)!
      speaker.speechCount++
      speaker.lastSpeakTime = speech.startTime
    }

    return Array.from(speakerMap.values()).sort((a, b) =>
      a.firstSpeakTime.getTime() - b.firstSpeakTime.getTime(),
    )
  }

  /**
   * 获取发言者统计信息
   */
  async getSpeakerStats(sessionId: string, speakerId: string): Promise<{
    totalSpeeches: number
    totalDuration: number
    averageConfidence: number
    firstSpeakTime: Date
    lastSpeakTime: Date
  } | null> {
    const speeches = await this.speechModel
      .find({ sessionId, speakerId })
      .exec()

    if (speeches.length === 0) {
      return null
    }

    const totalDuration = speeches.reduce((sum, s) => sum + (s.duration || 0), 0)
    const totalConfidence = speeches.reduce((sum, s) => sum + (s.confidence || 0), 0)

    return {
      totalSpeeches: speeches.length,
      totalDuration,
      averageConfidence: totalConfidence / speeches.length,
      firstSpeakTime: speeches[0].startTime,
      lastSpeakTime: speeches[speeches.length - 1].startTime,
    }
  }

  /**
   * 重命名发言者（会话内）
   */
  async renameSpeaker(
    sessionId: string,
    speakerId: string,
    newName: string,
  ): Promise<void> {
    await this.speechModel
      .updateMany(
        { sessionId, speakerId },
        { speakerName: newName },
      )
      .exec()
  }

  /**
   * 合并发言者（将一个发言者的发言记录合并到另一个）
   */
  async mergeSpeakers(
    sessionId: string,
    fromSpeakerId: string,
    toSpeakerId: string,
    toSpeakerName: string,
    toSpeakerColor: string,
  ): Promise<void> {
    await this.speechModel
      .updateMany(
        { sessionId, speakerId: fromSpeakerId },
        {
          speakerId: toSpeakerId,
          speakerName: toSpeakerName,
          speakerColor: toSpeakerColor,
        },
      )
      .exec()
  }

  /**
   * 生成发言者 ID（基于时间戳和随机数）
   */
  private generateSpeakerId(): string {
    return `spk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }

  /**
   * 为发言者分配颜色
   * 基于发言者 ID 的哈希值，确保同一发言者始终获得相同颜色
   */
  private assignColor(speakerId: string): string {
    // 使用简单的哈希算法
    let hash = 0
    for (let i = 0; i < speakerId.length; i++) {
      hash = speakerId.charCodeAt(i) + ((hash << 5) - hash)
    }

    const index = Math.abs(hash) % this.SPEAKER_COLORS.length
    return this.SPEAKER_COLORS[index]
  }

  /**
   * 获取发言者总数（会话内）
   */
  async getSpeakerCount(sessionId: string): Promise<number> {
    const result = await this.speechModel
      .aggregate([
        { $match: { sessionId } },
        { $group: { _id: '$speakerId' } },
        { $count: 'total' },
      ])
      .exec()

    return result[0]?.total || 0
  }

  /**
   * 获取活跃发言者列表（按发言数量排序）
   */
  async getActiveSpeakers(
    sessionId: string,
    limit = 10,
  ): Promise<SpeakerInfo[]> {
    const speakers = await this.getSpeakersBySession(sessionId)
    return speakers
      .sort((a, b) => b.speechCount - a.speechCount)
      .slice(0, limit)
  }
}
