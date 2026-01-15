import { Global, Module } from '@nestjs/common'
import { PrismaModule } from '../../database/prisma.module'
import { AppConfigController } from './app-config.controller'
import { AppConfigService } from './app-config.service'

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AppConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
