import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { DebugError, DebugErrorDocument } from './schemas/debug-error.schema'
import { DebugErrorDto } from './dto/debug-error.dto'

/**
 * 会话调试错误服务
 * 提供查询报错列表的能力
 */
@Injectable()
export class DebugErrorService {
  constructor(
    @InjectModel(DebugError.name) private debugErrorModel: Model<DebugErrorDocument>
  ) {}

  async findBySession(sessionId: string): Promise<DebugErrorDto[]> {
    const errors = await this.debugErrorModel
      .find({ sessionId })
      .sort({ occurredAt: -1, createdAt: -1 })
      .exec()

    return errors.map(error => this.toDto(error))
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
