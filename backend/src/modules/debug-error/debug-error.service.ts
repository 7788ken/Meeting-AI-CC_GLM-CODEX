import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { DebugError, DebugErrorDocument } from './schemas/debug-error.schema'
import { DebugErrorDto } from './dto/debug-error.dto'

type CreateDebugErrorInput = {
  sessionId: string
  message: string
  level?: 'info' | 'warn' | 'error' | 'fatal'
  source?: string
  category?: string
  errorCode?: string
  stack?: string
  context?: Record<string, unknown>
  occurredAt?: Date
}

type RecordDebugErrorInput = {
  sessionId: string
  level: 'info' | 'warn' | 'error' | 'fatal'
  message?: string
  source?: string
  category?: string
  errorCode?: string
  stack?: string
  context?: Record<string, unknown>
  occurredAt?: Date
  error?: unknown
}

/**
 * 会话调试错误服务
 * 提供查询报错列表的能力
 */
@Injectable()
export class DebugErrorService {
  private readonly logger = new Logger(DebugErrorService.name)

  constructor(@InjectModel(DebugError.name) private debugErrorModel: Model<DebugErrorDocument>) {}

  /**
   * 创建调试错误记录
   */
  async create(input: CreateDebugErrorInput): Promise<DebugErrorDto> {
    const error = new this.debugErrorModel({
      sessionId: input.sessionId,
      message: input.message,
      level: input.level ?? 'error',
      source: input.source,
      category: input.category,
      errorCode: input.errorCode,
      stack: input.stack,
      context: input.context,
      occurredAt: input.occurredAt ?? new Date(),
    })

    const saved = await error.save()
    return this.toDto(saved)
  }

  /**
   * 记录错误（自动补全 message/stack）
   */
  async recordError(input: RecordDebugErrorInput): Promise<void> {
    const message =
      input.message ??
      (input.error instanceof Error ? input.error.message : String(input.error ?? 'Unknown error'))
    const stack = input.stack ?? (input.error instanceof Error ? input.error.stack : undefined)

    try {
      await this.create({
        sessionId: input.sessionId,
        message,
        level: input.level,
        source: input.source,
        category: input.category,
        errorCode: input.errorCode,
        stack,
        context: input.context,
        occurredAt: input.occurredAt ?? new Date(),
      })
    } catch (error) {
      this.logger.warn(
        `Failed to record debug error, sessionId=${input.sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  async findBySession(sessionId: string): Promise<DebugErrorDto[]> {
    const errors = await this.debugErrorModel
      .find({ sessionId })
      .sort({ occurredAt: -1, createdAt: -1 })
      .exec()

    return errors.map(error => this.toDto(error))
  }

  async findById(id: string): Promise<DebugErrorDto | null> {
    const normalized = typeof id === 'string' ? id.trim() : ''
    if (!normalized) return null
    const error = await this.debugErrorModel.findById(normalized).exec()
    return error ? this.toDto(error) : null
  }

  async deleteBySession(sessionId: string): Promise<{ deletedCount: number }> {
    const normalized = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!normalized) return { deletedCount: 0 }

    const result = await this.debugErrorModel.deleteMany({ sessionId: normalized }).exec()
    return { deletedCount: result.deletedCount ?? 0 }
  }

  private toDto(error: DebugErrorDocument): DebugErrorDto {
    return {
      id: error._id.toString(),
      sessionId: error.sessionId,
      level: error.level,
      message: error.message,
      source: error.source,
      category: error.category,
      errorCode: error.errorCode,
      stack: error.stack,
      context: error.context,
      occurredAt: error.occurredAt,
      createdAt: error.createdAt,
    }
  }
}
