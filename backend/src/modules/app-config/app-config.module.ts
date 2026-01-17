import { Global, Module } from '@nestjs/common'
import { PrismaModule } from '../../database/prisma.module'
import { LlmModule } from '../../common/llm/llm.module'
import { AppConfigController } from './app-config.controller'
import { AppConfigService } from './app-config.service'
import { SettingsPasswordGuard } from './guards/settings-password.guard'

@Global()
@Module({
  imports: [PrismaModule, LlmModule],
  controllers: [AppConfigController],
  providers: [AppConfigService, SettingsPasswordGuard],
  exports: [AppConfigService, SettingsPasswordGuard],
})
export class AppConfigModule {}
