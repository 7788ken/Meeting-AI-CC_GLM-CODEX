import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { AppConfigService } from '../app-config/app-config.service'
import { AppLogDto } from './dto/app-log.dto'

export type AppLogType = 'request_response' | 'error' | 'system' | 'llm'
export type AppLogLevel = 'info' | 'warn' | 'error'

type RequestResponseLogInput = {
  sessionId?: string
  method: string
  path: string
  statusCode: number
  durationMs: number
  request?: Record<string, unknown>
  response?: Record<string, unknown>
  ip?: string
  userAgent?: string
}

type ErrorLogInput = {
  sessionId?: string
  message: string
  statusCode?: number
  method?: string
  path?: string
  stack?: string
  error?: unknown
}

type SystemLogInput = {
  sessionId?: string
  message: string
  level?: AppLogLevel
  payload?: Record<string, unknown>
}

type LlmLogInput = {
  sessionId?: string
  label: string
  endpoint: string
  requestBody: Record<string, unknown>
  response?: { status?: number; data?: unknown }
  durationMs?: number
  scheduleKey?: string
  responseText?: string
}

@Injectable()
export class AppLogService {
  private readonly logger = new Logger(AppLogService.name)
  private readonly maxTextLength = 2000
  private readonly maxArrayLength = 50
  private readonly maxDepth = 4
  private readonly maxLogRecords = 10000
  private readonly sensitiveKeys = new Set([
    'authorization',
    'password',
    'currentPassword',
    'newPassword',
    'token',
    'apiKey',
    'glmApiKey',
    'secret',
  ])

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfigService: AppConfigService
  ) {}

  async recordRequestResponseLog(input: RequestResponseLogInput): Promise<void> {
    if (!this.isRequestResponseEnabled()) return
    const method = input.method.trim().toUpperCase()
    if (method === 'GET' && typeof input.statusCode === 'number' && input.statusCode < 400) return

    const payload = this.sanitizePayload({
      method,
      path: input.path,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      request: input.request,
      response: input.response,
      ip: input.ip,
      userAgent: input.userAgent,
    })

    await this.createLog({
      sessionId: input.sessionId,
      type: 'request_response',
      level: input.statusCode >= 400 ? 'error' : 'info',
      message: `${method} ${input.path}`,
      payload,
    })
  }

  async recordErrorLog(input: ErrorLogInput): Promise<void> {
    if (!this.isErrorEnabled()) return

    const payload = this.sanitizePayload({
      statusCode: input.statusCode,
      method: input.method,
      path: input.path,
      stack: input.stack,
      error: input.error,
    })

    await this.createLog({
      sessionId: input.sessionId,
      type: 'error',
      level: 'error',
      message: input.message,
      payload,
    })
  }

  async recordSystemLog(input: SystemLogInput): Promise<void> {
    if (!this.isSystemEnabled()) return

    await this.createLog({
      sessionId: input.sessionId,
      type: 'system',
      level: input.level ?? 'info',
      message: input.message,
      payload: this.sanitizePayload(input.payload),
    })
  }

  async recordLlmRequestResponseLog(input: LlmLogInput): Promise<void> {
    if (!this.isRequestResponseEnabled()) return

    const prompt = this.extractPrompt(input.requestBody)
    const params = this.extractRequestParams(input.requestBody)
    const payload = {
      scope: 'llm',
      label: input.label,
      endpoint: input.endpoint,
      method: 'POST',
      path: input.endpoint,
      statusCode: input.response?.status,
      durationMs: input.durationMs,
      scheduleKey: input.scheduleKey,
      prompt,
      params,
      request: {
        body: input.requestBody,
      },
      response: input.response
        ? {
            status: input.response.status,
            data: input.response.data,
          }
        : undefined,
      responseText: input.responseText,
    }

    const statusCode = input.response?.status
    await this.createLog({
      sessionId: input.sessionId,
      type: 'llm',
      level: typeof statusCode === 'number' && statusCode >= 400 ? 'error' : 'info',
      message: `LLM ${input.label}`,
      payload: this.sanitizePayload(payload),
    })
  }

  async findBySession(sessionId: string, type?: AppLogType, limit = 200): Promise<AppLogDto[]> {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) return []

    const take = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200
    const logs = await this.prisma.appLog.findMany({
      where: {
        sessionId: normalizedSessionId,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    })

    return logs.map(log => ({
      id: log.id,
      sessionId: log.sessionId ?? undefined,
      type: log.type,
      level: log.level,
      message: log.message,
      payload: log.payload as Record<string, unknown> | undefined,
      createdAt: log.createdAt,
    }))
  }

  async deleteBySession(sessionId: string, type?: AppLogType): Promise<{ deletedCount: number }> {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) return { deletedCount: 0 }

    const result = await this.prisma.appLog.deleteMany({
      where: {
        sessionId: normalizedSessionId,
        ...(type ? { type } : {}),
      },
    })

    return { deletedCount: result.count ?? 0 }
  }

  async findLastRequestAtBySessions(sessionIds: string[]): Promise<Record<string, Date>> {
    const normalized = Array.from(new Set(sessionIds.map(id => id.trim()).filter(Boolean)))
    if (normalized.length === 0) return {}

    const rows = await this.prisma.appLog.groupBy({
      by: ['sessionId'],
      where: {
        sessionId: { in: normalized },
        type: { in: ['request_response', 'llm', 'error'] },
      },
      _max: { createdAt: true },
    })

    const result: Record<string, Date> = {}
    for (const row of rows) {
      if (!row.sessionId || !row._max.createdAt) continue
      result[row.sessionId] = row._max.createdAt
    }
    return result
  }

  private isRequestResponseEnabled(): boolean {
    return this.appConfigService.getBoolean('APP_LOG_REQUEST_RESPONSE_ENABLED', false)
  }

  private isErrorEnabled(): boolean {
    return this.appConfigService.getBoolean('APP_LOG_ERROR_ENABLED', false)
  }

  private isSystemEnabled(): boolean {
    return this.appConfigService.getBoolean('APP_LOG_SYSTEM_ENABLED', false)
  }

  private async createLog(input: {
    sessionId?: string
    type: AppLogType
    level: AppLogLevel
    message: string
    payload?: Record<string, unknown>
  }): Promise<void> {
    try {
      await this.prisma.appLog.create({
        data: {
          sessionId: input.sessionId?.trim() || null,
          type: input.type,
          level: input.level,
          message: input.message,
          payload: input.payload ? (input.payload as Prisma.JsonValue) : undefined,
        },
      })
      await this.pruneLogs()
    } catch (error) {
      this.logger.warn(
        `Failed to record app log: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private async pruneLogs(): Promise<void> {
    const cutoff = await this.prisma.appLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: this.maxLogRecords,
      take: 1,
      select: { createdAt: true },
    })
    if (cutoff.length === 0) return
    await this.prisma.appLog.deleteMany({
      where: {
        createdAt: { lt: cutoff[0].createdAt },
      },
    })
  }

  private sanitizePayload(input: unknown): Record<string, unknown> | undefined {
    if (input == null) return undefined
    if (typeof input !== 'object') {
      return { value: this.truncate(String(input)) }
    }
    return this.sanitizeValue(input, 0, new WeakSet()) as Record<string, unknown>
  }

  private sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (value == null) return value
    if (typeof value === 'string') return this.truncate(value)
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'bigint') return value.toString()
    if (value instanceof Date) return value.toISOString()
    if (Buffer.isBuffer(value)) return this.truncate(value.toString('base64'))
    if (Array.isArray(value)) {
      if (depth >= this.maxDepth) return '[Truncated]'
      return value
        .slice(0, this.maxArrayLength)
        .map(item => this.sanitizeValue(item, depth + 1, seen))
    }
    if (typeof value === 'object') {
      if (seen.has(value as object)) return '[Circular]'
      if (depth >= this.maxDepth) return '[Truncated]'
      seen.add(value as object)
      const result: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (this.sensitiveKeys.has(key)) {
          result[key] = '[REDACTED]'
        } else {
          result[key] = this.sanitizeValue(entry, depth + 1, seen)
        }
      }
      seen.delete(value as object)
      return result
    }
    return this.truncate(String(value))
  }

  private truncate(value: string): string {
    const normalized = value.trim()
    if (!normalized) return ''
    if (normalized.length <= this.maxTextLength) return normalized
    return `${normalized.slice(0, this.maxTextLength)}…(truncated)`
  }

  private extractPrompt(requestBody: Record<string, unknown>): {
    system?: string
    user?: string
  } {
    const messages = Array.isArray(requestBody.messages)
      ? (requestBody.messages as Array<Record<string, unknown>>)
      : []
    let system: string | undefined
    let user: string | undefined
    for (const message of messages) {
      const role = typeof message.role === 'string' ? message.role : ''
      const text = this.extractMessageContent(message.content)
      if (!text) continue
      if (role === 'system' && !system) system = text
      if (role === 'user' && !user) user = text
    }
    return { system, user }
  }

  private extractMessageContent(content: unknown): string | undefined {
    if (typeof content === 'string') return content.trim()
    if (content && typeof content === 'object' && !Array.isArray(content)) {
      const text = (content as { text?: unknown }).text
      return typeof text === 'string' ? text.trim() : undefined
    }
    if (!Array.isArray(content)) return undefined
    const parts: string[] = []
    for (const entry of content) {
      if (typeof entry === 'string') {
        if (entry.trim()) parts.push(entry.trim())
        continue
      }
      if (entry && typeof entry === 'object') {
        const text = (entry as { text?: unknown }).text
        if (typeof text === 'string' && text.trim()) parts.push(text.trim())
      }
    }
    const joined = parts.join('\n').trim()
    return joined ? joined : undefined
  }

  private extractRequestParams(requestBody: Record<string, unknown>): Record<string, unknown> {
    const pick = (key: string) => (key in requestBody ? requestBody[key] : undefined)
    const params: Record<string, unknown> = {}
    for (const key of [
      'model',
      'temperature',
      'max_tokens',
      'thinking',
      'response_format',
      'stream',
    ]) {
      const value = pick(key)
      if (value != null) params[key] = value
    }
    return params
  }
}
