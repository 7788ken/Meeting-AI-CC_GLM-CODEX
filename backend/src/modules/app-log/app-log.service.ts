import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { AppConfigService } from '../app-config/app-config.service'
import { AppLogDto } from './dto/app-log.dto'

export type AppLogType = 'request_response' | 'error' | 'system'
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

@Injectable()
export class AppLogService {
  private readonly logger = new Logger(AppLogService.name)
  private readonly maxTextLength = 2000
  private readonly maxArrayLength = 50
  private readonly maxDepth = 4
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

    const payload = this.sanitizePayload({
      method: input.method,
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
      message: `${input.method} ${input.path}`,
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

  async findBySession(
    sessionId: string,
    type?: AppLogType,
    limit = 200
  ): Promise<AppLogDto[]> {
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

  async deleteBySession(
    sessionId: string,
    type?: AppLogType
  ): Promise<{ deletedCount: number }> {
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
          payload: input.payload ? (input.payload as Prisma.InputJsonValue) : undefined,
        },
      })
    } catch (error) {
      this.logger.warn(
        `Failed to record app log: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private sanitizePayload(input: unknown): Record<string, unknown> | undefined {
    if (input == null) return undefined
    if (typeof input !== 'object') {
      return { value: this.truncate(String(input)) }
    }
    return this.sanitizeValue(input, 0, new WeakSet()) as Record<string, unknown>
  }

  private sanitizeValue(
    value: unknown,
    depth: number,
    seen: WeakSet<object>
  ): unknown {
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
}
