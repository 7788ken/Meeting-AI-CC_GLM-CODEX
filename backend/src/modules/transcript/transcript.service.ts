import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TranscriptResultDto } from './dto/transcript.dto'

@Injectable()
export class TranscriptService {
  // 客户端映射
  private clients: Map<string, Socket> = new Map()

  // 模拟的发言者计数器
  private speakerCounter = 0

  constructor(private readonly configService: ConfigService) {}

  addClient(clientId: string, socket: any) {
    this.clients.set(clientId, socket)
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId)
  }

  async processAudio(
    clientId: string,
    audioData: string,
    sessionId: string
  ): Promise<TranscriptResultDto | null> {
    // TODO: 调用豆包流语音识别API
    // 这里先返回模拟数据

    // 模拟API调用延迟
    await this.delay(500)

    // 模拟转写结果
    const result: TranscriptResultDto = {
      id: this.generateId(),
      sessionId,
      speakerId: `speaker_${this.speakerCounter % 3}`, // 模拟3个发言者
      speakerName: `发言者${(this.speakerCounter % 3) + 1}`,
      content: `这是第${Math.floor(this.speakerCounter / 3) + 1}条模拟转写内容`,
      isFinal: true,
      confidence: 0.95 + Math.random() * 0.04,
    }

    this.speakerCounter++

    return result
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private generateId(): string {
    return `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}
