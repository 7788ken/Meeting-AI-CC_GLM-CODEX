import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { MongooseModule } from '@nestjs/mongoose'
import { AnalysisController } from './analysis.controller'
import { AnalysisService } from './analysis.service'
import { Analysis, AnalysisSchema } from './schemas/analysis.schema'
import { GlmClient } from './clients/glm.client'
import { DoubaoClient } from './clients/doubao.client'
import { SpeechModule } from '../speech/speech.module'

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([{ name: Analysis.name, schema: AnalysisSchema }]),
    SpeechModule,
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService, GlmClient, DoubaoClient],
  exports: [AnalysisService, GlmClient, DoubaoClient],
})
export class AnalysisModule {}
