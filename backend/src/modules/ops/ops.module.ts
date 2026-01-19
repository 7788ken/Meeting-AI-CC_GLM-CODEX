import { Module } from '@nestjs/common'
import { OpsController } from './ops.controller'
import { SessionModule } from '../session/session.module'
import { SessionActivityService } from './session-activity.service'

@Module({
  imports: [SessionModule],
  controllers: [OpsController],
  providers: [SessionActivityService],
  exports: [SessionActivityService],
})
export class OpsModule {}
