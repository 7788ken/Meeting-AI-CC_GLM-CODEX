import { Module } from '@nestjs/common'
import { PrismaModule } from '../../database/prisma.module'
import { AppLogController } from './app-log.controller'
import { AppLogService } from './app-log.service'

@Module({
  imports: [PrismaModule],
  controllers: [AppLogController],
  providers: [AppLogService],
  exports: [AppLogService],
})
export class AppLogModule {}
