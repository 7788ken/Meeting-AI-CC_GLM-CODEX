import { Global, Module } from '@nestjs/common'
import { PrismaModule } from '../../database/prisma.module'
import { AppConfigController } from './app-config.controller'
import { AppConfigService } from './app-config.service'
import { SettingsPasswordGuard } from './guards/settings-password.guard'

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AppConfigController],
  providers: [AppConfigService, SettingsPasswordGuard],
  exports: [AppConfigService, SettingsPasswordGuard],
})
export class AppConfigModule {}
