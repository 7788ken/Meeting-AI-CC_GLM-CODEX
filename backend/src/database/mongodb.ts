import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection } from 'mongoose'

/**
 * MongoDB 连接配置 (B1009)
 * 提供 MongoDB 连接管理和健康检查
 */
@Injectable()
export class MongoDBService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoDBService.name)

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * 模块初始化时验证连接
   */
  async onModuleInit() {
    try {
      if (this.connection.readyState === 1) {
        this.logger.log('MongoDB connected successfully')
      } else {
        this.logger.warn('MongoDB connection not ready, waiting...')
        // 等待连接建立
        await new Promise<void>(resolve => {
          const checkInterval = setInterval(() => {
            if (this.connection.readyState === 1) {
              clearInterval(checkInterval)
              this.logger.log('MongoDB connected successfully')
              resolve()
            }
          }, 500)

          // 10秒超时
          setTimeout(() => {
            clearInterval(checkInterval)
            if (this.connection.readyState !== 1) {
              this.logger.warn('MongoDB connection timeout')
              resolve()
            }
          }, 10000)
        })
      }
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB', error)
      throw error
    }
  }

  /**
   * 模块销毁时断开连接
   */
  async onModuleDestroy() {
    try {
      await this.connection.close()
      this.logger.log('MongoDB disconnected')
    } catch (error) {
      this.logger.error('Error disconnecting MongoDB', error)
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return this.connection.readyState === 1
  }

  /**
   * 获取连接状态
   */
  getConnectionState(): string {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting']
    return states[this.connection.readyState] || 'unknown'
  }

  /**
   * 清理所有数据（仅用于测试环境）
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production')
    }

    const collections = await this.connection.db.collections()
    for (const collection of collections) {
      await collection.deleteMany({})
    }

    this.logger.log('Database cleaned')
  }
}
