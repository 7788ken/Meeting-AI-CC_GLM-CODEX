import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ConfigurationService } from './config/configuration.service'
import configuration from './config/configuration'
import { PrismaModule } from './database/prisma.module'
import { MongoDBModule } from './database/mongodb.module'
import { SessionModule } from './modules/session/session.module'
import { SpeechModule } from './modules/speech/speech.module'
import { AnalysisModule } from './modules/analysis/analysis.module'
import { TranscriptModule } from './modules/transcript/transcript.module'
import { AuthModule } from './modules/auth/auth.module'
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    MongoDBModule,
    AuthModule,
    SessionModule,
    SpeechModule,
    AnalysisModule,
    TranscriptModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ConfigurationService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [TranscriptModule],
})
export class AppModule {}
