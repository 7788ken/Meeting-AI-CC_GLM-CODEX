import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { DebugErrorController } from './debug-error.controller'
import { DebugErrorService } from './debug-error.service'
import { DebugError, DebugErrorSchema } from './schemas/debug-error.schema'

@Module({
  imports: [MongooseModule.forFeature([{ name: DebugError.name, schema: DebugErrorSchema }])],
  controllers: [DebugErrorController],
  providers: [DebugErrorService],
  exports: [DebugErrorService],
})
export class DebugErrorModule {}
