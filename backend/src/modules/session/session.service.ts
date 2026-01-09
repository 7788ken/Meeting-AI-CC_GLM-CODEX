import { Injectable, NotFoundException } from '@nestjs/common'
import { SessionDto } from './dto/session.dto'

@Injectable()
export class SessionService {
  // 简单的内存存储，生产环境应使用数据库
  private sessions: Map<string, SessionDto> = new Map()

  create(settings?: Record<string, unknown>): SessionDto {
    const session: SessionDto = {
      id: this.generateId(),
      startedAt: new Date(),
      endedAt: null,
      duration: null,
      isActive: true,
    }
    this.sessions.set(session.id, session)
    return session
  }

  async findOne(id: string): Promise<SessionDto> {
    const session = this.sessions.get(id)
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`)
    }
    return session
  }

  async end(id: string): Promise<SessionDto> {
    const session = await this.findOne(id)
    session.endedAt = new Date()
    session.duration =
      session.endedAt.getTime() - new Date(session.startedAt).getTime()
    session.isActive = false
    this.sessions.set(id, session)
    return session
  }

  findAll(): SessionDto[] {
    return Array.from(this.sessions.values())
  }

  private generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}
