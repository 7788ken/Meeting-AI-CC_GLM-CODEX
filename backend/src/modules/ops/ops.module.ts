import { Module } from '@nestjs/common'
import { OpsController } from './ops.controller'
import { SessionModule } from '../session/session.module'

@Module({
  imports: [SessionModule],
  controllers: [OpsController],
})
export class OpsModule {}
