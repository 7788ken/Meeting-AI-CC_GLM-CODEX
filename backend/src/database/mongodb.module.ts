import { Module, Global } from '@nestjs/common'
import { MongooseModule as NestMongooseModule } from '@nestjs/mongoose'
import { ConfigService } from '@nestjs/config'
import { MongoDBService } from './mongodb'

/**
 * MongoDB 模块 (B1009)
 * 全局模块，提供 MongoDB 连接和模型注册
 */
@Global()
@Module({
  imports: [
    NestMongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI') || 'mongodb://localhost:27017/meeting-ai',
        connectionFactory: (connection) => {
          // 连接事件监听
          connection.on('connected', () => {
            console.log('✅ MongoDB connected successfully')
          })
          connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err)
          })
          connection.on('disconnected', () => {
            console.log('⚠️  MongoDB disconnected')
          })
          return connection
        },
      }),
    }),
  ],
  providers: [MongoDBService],
  exports: [MongoDBService],
})
export class MongoDBModule {}
