import { Global, Module } from '@nestjs/common'
import { GlmRateLimiter } from './glm-rate-limiter'

@Global()
@Module({
  providers: [GlmRateLimiter],
  exports: [GlmRateLimiter],
})
export class LlmModule {}
