import { Injectable, NotFoundException } from '@nestjs/common'
import { Session, SessionStatus, Speaker } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { SessionDto } from './dto/session.dto'

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(settings?: Record<string, unknown>): Promise<SessionDto> {
    const { title, description } = this.extractSessionMeta(settings)
    const session = await this.prisma.session.create({
      data: {
        title,
        description,
        status: SessionStatus.CREATED,
      },
    })
    return this.toSessionDto(session)
  }

  async findOne(id: string): Promise<SessionDto> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { speakers: true },
    })
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`)
    }
    return this.toSessionDto(session)
  }

  async end(id: string): Promise<SessionDto> {
    await this.ensureSessionExists(id)
    const session = await this.prisma.session.update({
      where: { id },
      data: { status: SessionStatus.ENDED, endTime: new Date() },
    })
    return this.toSessionDto(session)
  }

  async findAll(): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany()
    return sessions.map((session) => this.toSessionDto(session))
  }

  async updateStatus(id: string, status: SessionStatus): Promise<SessionDto> {
    await this.ensureSessionExists(id)
    const session = await this.prisma.session.update({
      where: { id },
      data: { status },
    })
    return this.toSessionDto(session)
  }

  async addSpeaker(
    sessionId: string,
    input: { name: string; avatarUrl?: string; color?: string }
  ): Promise<Speaker> {
    await this.ensureSessionExists(sessionId)
    return this.prisma.speaker.create({
      data: {
        sessionId,
        name: input.name,
        avatarUrl: input.avatarUrl,
        color: input.color,
      },
    })
  }

  async getSpeakers(sessionId: string): Promise<Speaker[]> {
    await this.ensureSessionExists(sessionId)
    return this.prisma.speaker.findMany({ where: { sessionId } })
  }

  private async ensureSessionExists(id: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`)
    }
  }

  private toSessionDto(session: Session): SessionDto {
    const endedAt = session.endTime ?? null
    const duration = endedAt ? endedAt.getTime() - session.startTime.getTime() : null

    return {
      id: session.id,
      startedAt: session.startTime,
      endedAt,
      duration,
      isActive: session.status !== SessionStatus.ENDED,
    }
  }

  private extractSessionMeta(
    settings?: Record<string, unknown>
  ): { title: string; description?: string } {
    const rawTitle = settings?.['title']
    const rawDescription = settings?.['description']
    const title =
      typeof rawTitle === 'string' && rawTitle.trim().length > 0
        ? rawTitle.trim()
        : `Session ${new Date().toISOString()}`
    const description =
      typeof rawDescription === 'string' && rawDescription.trim().length > 0
        ? rawDescription.trim()
        : undefined

    return { title, description }
  }
}
