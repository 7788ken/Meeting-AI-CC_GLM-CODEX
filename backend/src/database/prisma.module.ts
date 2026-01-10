import { Module, Global } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/**
 * Prisma 模块 (B1006)
 * 全局模块，提供数据库服务
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
