import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigurationService } from './config/configuration.service'
import configuration from './config/configuration'
import { LlmModule } from './common/llm/llm.module'
import { PrismaModule } from './database/prisma.module'
import { MongoDBModule } from './database/mongodb.module'
import { SessionModule } from './modules/session/session.module'
import { SpeechModule } from './modules/speech/speech.module'
import { TranscriptModule } from './modules/transcript/transcript.module'
import { TranscriptStreamModule } from './modules/transcript-stream/transcript-stream.module'
import { TranscriptEventSegmentationModule } from './modules/transcript-event-segmentation/transcript-event-segmentation.module'
import { TranscriptAnalysisModule } from './modules/transcript-analysis/transcript-analysis.module'
import { AuthModule } from './modules/auth/auth.module'
import { DebugErrorModule } from './modules/debug-error/debug-error.module'
import { AppLogModule } from './modules/app-log/app-log.module'
import { AppConfigModule } from './modules/app-config/app-config.module'
import { PromptLibraryModule } from './modules/prompt-library/prompt-library.module'
import { OpsModule } from './modules/ops/ops.module'
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'
import { AppLogInterceptor } from './common/interceptors/app-log.interceptor'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    LlmModule,
    PrismaModule,
    MongoDBModule,
    AppConfigModule,
    PromptLibraryModule,
    AuthModule,
    OpsModule,
    SessionModule,
    SpeechModule,
    TranscriptModule,
    TranscriptStreamModule,
    TranscriptEventSegmentationModule,
    TranscriptAnalysisModule,
    DebugErrorModule,
    AppLogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ConfigurationService,
    AllExceptionsFilter,
    {
      provide: APP_INTERCEPTOR,
      useClass: AppLogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [TranscriptModule],
})
export class AppModule {}
