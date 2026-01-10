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
 * 发言者相似度结果
 */
export interface SpeakerSimilarity {
  speakerId1: string
  speakerId2: string
  name1: string
  name2: string
  similarity: number
  reason: string
}

/**
 * 发言者识别服务 (B1020 + B1021)
 * 提供发言者识别、管理和智能优化功能
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

  // 相似度阈值
  private readonly SIMILARITY_THRESHOLD = 0.7
  private readonly NAME_SIMILARITY_THRESHOLD = 0.6

  private colorIndex = 0

  constructor(@InjectModel(Speech.name) private speechModel: Model<SpeechDocument>) {}

  /**
   * 为新发言分配发言者信息
   * 基础版本：根据发言者名称或 ID 分配颜色
   */
  assignSpeaker(
    speakerId: string,
    speakerName?: string
  ): {
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
    speakerName: string
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
    const speeches = await this.speechModel.find({ sessionId }).sort({ startTime: 1 }).exec()

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

    return Array.from(speakerMap.values()).sort(
      (a, b) => a.firstSpeakTime.getTime() - b.firstSpeakTime.getTime()
    )
  }

  /**
   * 获取发言者统计信息
   */
  async getSpeakerStats(
    sessionId: string,
    speakerId: string
  ): Promise<{
    totalSpeeches: number
    totalDuration: number
    averageConfidence: number
    firstSpeakTime: Date
    lastSpeakTime: Date
  } | null> {
    const speeches = await this.speechModel.find({ sessionId, speakerId }).exec()

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
  async renameSpeaker(sessionId: string, speakerId: string, newName: string): Promise<void> {
    await this.speechModel.updateMany({ sessionId, speakerId }, { speakerName: newName }).exec()
  }

  /**
   * 合并发言者（将一个发言者的发言记录合并到另一个）
   */
  async mergeSpeakers(
    sessionId: string,
    fromSpeakerId: string,
    toSpeakerId: string,
    toSpeakerName: string,
    toSpeakerColor: string
  ): Promise<void> {
    await this.speechModel
      .updateMany(
        { sessionId, speakerId: fromSpeakerId },
        {
          speakerId: toSpeakerId,
          speakerName: toSpeakerName,
          speakerColor: toSpeakerColor,
        }
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
  async getActiveSpeakers(sessionId: string, limit = 10): Promise<SpeakerInfo[]> {
    const speakers = await this.getSpeakersBySession(sessionId)
    return speakers.sort((a, b) => b.speechCount - a.speechCount).slice(0, limit)
  }

  // ==================== B1021: 优化算法 ====================

  /**
   * 分析可能重复的发言者（智能合并建议）
   */
  async findSimilarSpeakers(sessionId: string): Promise<SpeakerSimilarity[]> {
    const speakers = await this.getSpeakersBySession(sessionId)
    const similarities: SpeakerSimilarity[] = []

    for (let i = 0; i < speakers.length; i++) {
      for (let j = i + 1; j < speakers.length; j++) {
        const speaker1 = speakers[i]
        const speaker2 = speakers[j]

        const similarity = await this.calculateSpeakerSimilarity(sessionId, speaker1, speaker2)

        if (similarity.similarity >= this.SIMILARITY_THRESHOLD) {
          similarities.push(similarity)
        }
      }
    }

    return similarities.sort((a, b) => b.similarity - a.similarity)
  }

  /**
   * 计算两个发言者的相似度
   */
  private async calculateSpeakerSimilarity(
    sessionId: string,
    speaker1: SpeakerInfo,
    speaker2: SpeakerInfo
  ): Promise<SpeakerSimilarity> {
    let totalScore = 0
    const reasons: string[] = []

    // 1. 名称相似度（编辑距离）
    const nameSimilarity = this.calculateStringSimilarity(speaker1.name, speaker2.name)
    if (nameSimilarity > this.NAME_SIMILARITY_THRESHOLD) {
      totalScore += nameSimilarity * 0.4
      reasons.push(`名称相似: ${(nameSimilarity * 100).toFixed(0)}%`)
    }

    // 2. 获取发言记录进行声学特征比较
    const speeches1 = await this.speechModel
      .find({ sessionId, speakerId: speaker1.id })
      .limit(10)
      .exec()

    const speeches2 = await this.speechModel
      .find({ sessionId, speakerId: speaker2.id })
      .limit(10)
      .exec()

    // 3. 平均置信度相似度
    const avgConfidence1 = this.averageConfidence(speeches1)
    const avgConfidence2 = this.averageConfidence(speeches2)
    const confidenceDiff = 1 - Math.abs(avgConfidence1 - avgConfidence2)
    totalScore += confidenceDiff * 0.15
    reasons.push(`置信度相似: ${(confidenceDiff * 100).toFixed(0)}%`)

    // 4. 平均发言时长相似度
    const avgDuration1 = this.averageDuration(speeches1)
    const avgDuration2 = this.averageDuration(speeches2)
    const durationSimilarity =
      1 - Math.abs(avgDuration1 - avgDuration2) / Math.max(avgDuration1, avgDuration2)
    totalScore += durationSimilarity * 0.15
    reasons.push(`时长相似: ${(durationSimilarity * 100).toFixed(0)}%`)

    // 5. 时间交错程度（如果两个发言者频繁交替发言，可能是不同人）
    const alternatingScore = await this.calculateAlternatingScore(
      sessionId,
      speaker1.id,
      speaker2.id
    )
    totalScore += (1 - alternatingScore) * 0.3
    reasons.push(`时间交错: ${((1 - alternatingScore) * 100).toFixed(0)}%`)

    return {
      speakerId1: speaker1.id,
      speakerId2: speaker2.id,
      name1: speaker1.name,
      name2: speaker2.name,
      similarity: Math.min(totalScore, 1),
      reason: reasons.join(', '),
    }
  }

  /**
   * 计算字符串相似度（Levenshtein 距离）
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length
    const len2 = str2.length

    if (len1 === 0) return len2 === 0 ? 1 : 0
    if (len2 === 0) return 0

    const matrix: number[][] = []
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        )
      }
    }

    const maxLen = Math.max(len1, len2)
    return 1 - matrix[len1][len2] / maxLen
  }

  /**
   * 计算两个发言者的时间交错程度
   * 返回值越高表示两者越可能交替发言（即不同人）
   */
  private async calculateAlternatingScore(
    sessionId: string,
    speakerId1: string,
    speakerId2: string
  ): Promise<number> {
    const speeches = await this.speechModel
      .find({
        sessionId,
        $or: [{ speakerId: speakerId1 }, { speakerId: speakerId2 }],
      })
      .sort({ startTime: 1 })
      .exec()

    if (speeches.length < 2) return 0

    let switchCount = 0
    let lastSpeaker = speeches[0].speakerId

    for (let i = 1; i < speeches.length; i++) {
      if (speeches[i].speakerId !== lastSpeaker) {
        switchCount++
        lastSpeaker = speeches[i].speakerId
      }
    }

    // 交错次数 / 总发言次数
    return speeches.length > 0 ? switchCount / speeches.length : 0
  }

  /**
   * 获取发言记录的平均置信度
   */
  private averageConfidence(speeches: SpeechDocument[]): number {
    if (speeches.length === 0) return 0
    const sum = speeches.reduce((acc, s) => acc + (s.confidence || 0), 0)
    return sum / speeches.length
  }

  /**
   * 获取发言记录的平均时长
   */
  private averageDuration(speeches: SpeechDocument[]): number {
    if (speeches.length === 0) return 0
    const sum = speeches.reduce((acc, s) => acc + (s.duration || 0), 0)
    return sum / speeches.length
  }

  /**
   * 智能规范化发言者名称
   * 自动将相似的名称统一
   */
  async normalizeSpeakerNames(sessionId: string): Promise<number> {
    const speakers = await this.getSpeakersBySession(sessionId)
    const nameGroups = new Map<string, SpeakerInfo[]>()

    // 按相似名称分组
    for (const speaker of speakers) {
      let grouped = false

      for (const [normalizedName, group] of nameGroups) {
        if (
          this.calculateStringSimilarity(speaker.name, normalizedName) >
          this.NAME_SIMILARITY_THRESHOLD
        ) {
          group.push(speaker)
          grouped = true
          break
        }
      }

      if (!grouped) {
        nameGroups.set(speaker.name, [speaker])
      }
    }

    // 合并相似名称的发言者
    let mergeCount = 0
    for (const [normalizedName, group] of nameGroups) {
      if (group.length > 1) {
        // 选择第一个作为主发言者
        const mainSpeaker = group[0]
        for (let i = 1; i < group.length; i++) {
          await this.mergeSpeakers(
            sessionId,
            group[i].id,
            mainSpeaker.id,
            normalizedName,
            mainSpeaker.color
          )
          mergeCount++
        }
      }
    }

    return mergeCount
  }

  /**
   * 检测发言者切换（基于时间窗口）
   * 返回可能的发言者切换点
   */
  async detectSpeakerSwitches(
    sessionId: string,
    windowSeconds = 5
  ): Promise<Array<{ time: Date; fromSpeaker: string; toSpeaker: string; confidence: number }>> {
    const speeches = await this.speechModel.find({ sessionId }).sort({ startTime: 1 }).exec()

    const switches: Array<{
      time: Date
      fromSpeaker: string
      toSpeaker: string
      confidence: number
    }> = []

    for (let i = 1; i < speeches.length; i++) {
      const prev = speeches[i - 1]
      const curr = speeches[i]

      // 时间间隔在窗口内且发言者不同
      const timeDiff = (curr.startTime.getTime() - prev.endTime.getTime()) / 1000

      if (prev.speakerId !== curr.speakerId && timeDiff >= 0 && timeDiff <= windowSeconds) {
        // 计算切换置信度（基于时间间隔，间隔越短置信度越高）
        const confidence = 1 - timeDiff / windowSeconds
        switches.push({
          time: curr.startTime,
          fromSpeaker: prev.speakerId,
          toSpeaker: curr.speakerId,
          confidence,
        })
      }
    }

    return switches
  }
}
