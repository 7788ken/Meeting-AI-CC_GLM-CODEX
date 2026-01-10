import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

/**
 * Prisma 服务 (B1006)
 * 封装 Prisma Client，提供数据库连接管理
 * 实现模块初始化和销毁时的连接管理
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    })
  }

  /**
   * 模块初始化时连接数据库
   */
  async onModuleInit() {
    try {
      await this.$connect()
      this.logger.log('Database connected successfully')
    } catch (error) {
      this.logger.error('Failed to connect to database', error)
      throw error
    }
  }

  /**
   * 模块销毁时断开数据库连接
   */
  async onModuleDestroy() {
    await this.$disconnect()
    this.logger.log('Database disconnected')
  }

  /**
   * 清理所有数据（仅用于测试环境）
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production')
    }

    // 按照外键依赖顺序删除
    await this.speaker.deleteMany()
    await this.session.deleteMany()
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }
}
