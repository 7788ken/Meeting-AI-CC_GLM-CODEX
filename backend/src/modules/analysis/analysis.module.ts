import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { AnalysisController } from './analysis.controller'
import { AnalysisService } from './analysis.service'

@Module({
  imports: [HttpModule],
  controllers: [AnalysisController],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
