import { Module } from '@nestjs/common'
import { AppConfigModule } from '../app-config/app-config.module'
import { PromptLibraryController } from './prompt-library.controller'
import { PromptLibraryService } from './prompt-library.service'

@Module({
  imports: [AppConfigModule],
  controllers: [PromptLibraryController],
  providers: [PromptLibraryService],
  exports: [PromptLibraryService],
})
export class PromptLibraryModule {}
