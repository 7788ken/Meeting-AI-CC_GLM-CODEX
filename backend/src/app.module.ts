import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ConfigurationService } from './config/configuration.service'
import configuration from './config/configuration'
import { SessionModule } from './modules/session/session.module'
import { SpeechModule } from './modules/speech/speech.module'
import { AnalysisModule } from './modules/analysis/analysis.module'
import { TranscriptModule } from './modules/transcript/transcript.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    SessionModule,
    SpeechModule,
    AnalysisModule,
    TranscriptModule,
  ],
  controllers: [AppController],
  providers: [AppService, ConfigurationService],
  exports: [TranscriptModule],
})
export class AppModule {}
