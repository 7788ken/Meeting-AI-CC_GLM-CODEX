import { Injectable, NotFoundException } from '@nestjs/common'
import { SpeechDto } from './dto/speech.dto'
import { CreateSpeechDto, UpdateSpeechDto } from './dto/speech.dto'

@Injectable()
export class SpeechService {
  private speeches: Map<string, SpeechDto> = new Map()
  private sessionSpeeches: Map<string, string[]> = new Map()

  create(dto: CreateSpeechDto): SpeechDto {
    const now = new Date()
    const speech: SpeechDto = {
      id: this.generateId(),
      sessionId: dto.sessionId,
      speakerId: dto.speakerId,
      speakerName: dto.speakerName,
      content: dto.content,
      startTime: now,
      endTime: now,
      duration: 0,
      confidence: dto.confidence ?? 0,
      isEdited: false,
      isMarked: false,
    }

    this.speeches.set(speech.id, speech)

    // 添加到会话的发言列表
    if (!this.sessionSpeeches.has(dto.sessionId)) {
      this.sessionSpeeches.set(dto.sessionId, [])
    }
    this.sessionSpeeches.get(dto.sessionId)!.push(speech.id)

    return speech
  }

  async findOne(id: string): Promise<SpeechDto> {
    const speech = this.speeches.get(id)
    if (!speech) {
      throw new NotFoundException(`Speech ${id} not found`)
    }
    return speech
  }

  findBySession(sessionId: string): SpeechDto[] {
    const speechIds = this.sessionSpeeches.get(sessionId) || []
    return speechIds.map((id) => this.speeches.get(id)!).filter(Boolean)
  }

  async update(id: string, dto: UpdateSpeechDto): Promise<SpeechDto> {
    const speech = await this.findOne(id)
    const updated = { ...speech, ...dto }
    this.speeches.set(id, updated)
    return updated
  }

  private generateId(): string {
    return `speech_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}
