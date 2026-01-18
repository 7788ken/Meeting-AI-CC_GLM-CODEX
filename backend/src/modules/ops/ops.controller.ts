import { Controller, MessageEvent, Sse } from '@nestjs/common'
import { interval, type Observable } from 'rxjs'
import { mergeMap, startWith } from 'rxjs/operators'
import { GlmRateLimiter } from '../../common/llm/glm-rate-limiter'
import { SessionService } from '../session/session.service'
import { Public } from '../auth/decorators/public.decorator'

const OPS_STREAM_INTERVAL_MS = 2500

@Controller('ops')
export class OpsController {
  constructor(
    private readonly glmRateLimiter: GlmRateLimiter,
    private readonly sessionService: SessionService
  ) {}

  @Public()
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return interval(OPS_STREAM_INTERVAL_MS).pipe(
      startWith(0),
      mergeMap(async () => {
        try {
          const queueStats = this.glmRateLimiter.getQueueStats()
          const sessions = await this.sessionService.findAll()
          return {
            data: {
              queueStats,
              sessions,
              timestamp: Date.now(),
            },
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '运行流生成失败'
          return {
            data: {
              error: message,
              timestamp: Date.now(),
            },
          }
        }
      })
    )
  }
}
