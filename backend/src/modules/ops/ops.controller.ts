import { Controller, MessageEvent, Sse } from '@nestjs/common'
import { interval, type Observable } from 'rxjs'
import { mergeMap, startWith } from 'rxjs/operators'
import { GlmRateLimiter } from '../../common/llm/glm-rate-limiter'
import { SessionService } from '../session/session.service'
import { SessionActivityService } from './session-activity.service'
import { Public } from '../auth/decorators/public.decorator'

const OPS_STREAM_INTERVAL_MS = 1000

@Controller('ops')
export class OpsController {
  constructor(
    private readonly glmRateLimiter: GlmRateLimiter,
    private readonly sessionService: SessionService,
    private readonly sessionActivityService: SessionActivityService
  ) {}

  @Public()
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return interval(OPS_STREAM_INTERVAL_MS).pipe(
      startWith(0),
      mergeMap(async () => {
        try {
          const queueStats = this.glmRateLimiter.getQueueStats()
          const taskLog = this.glmRateLimiter.getTaskLog()
          const sessions = await this.sessionService.findAll()
          const lastRequestAtByTaskLog = this.buildLastRequestAtByTaskLog(taskLog)
          const now = Date.now()
          const sessionsWithActivity = sessions.map(session => ({
            ...session,
            lastRequestAt: this.resolveLastRequestAt(
              this.sessionActivityService.getLastActivityAt(session.id),
              lastRequestAtByTaskLog[session.id]
            ),
            isRecording: this.sessionActivityService.isRecording(session.id, now),
          }))
          return {
            data: {
              queueStats,
              taskLog,
              sessions: sessionsWithActivity,
              timestamp: now,
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

  private buildLastRequestAtByTaskLog(
    taskLog: Array<{ id: string; startedAt: number; finishedAt: number }>
  ): Record<string, number> {
    const result: Record<string, number> = {}
    for (const task of taskLog) {
      const sessionId = this.extractSessionIdFromTaskId(task.id)
      if (!sessionId) continue
      const candidate = Number.isFinite(task.finishedAt) ? task.finishedAt : task.startedAt
      if (!Number.isFinite(candidate)) continue
      const existing = result[sessionId] ?? 0
      if (candidate > existing) {
        result[sessionId] = candidate
      }
    }
    return result
  }

  private extractSessionIdFromTaskId(taskId: string): string | null {
    if (!taskId) return null
    const normalized = taskId.trim()
    if (!normalized) return null

    if (normalized.startsWith('analysis:summary:')) {
      const parts = normalized.split(':')
      return parts[2] || null
    }
    if (normalized.startsWith('analysis:segment:')) {
      const parts = normalized.split(':')
      return parts[2] || null
    }
    if (normalized.startsWith('translation:')) {
      const parts = normalized.split(':')
      return parts[1] || null
    }
    return null
  }

  private resolveLastRequestAt(activityAt: Date | null, taskLogAt?: number): Date | null {
    const activityMs = activityAt ? activityAt.getTime() : 0
    const taskLogMs = Number.isFinite(taskLogAt) ? (taskLogAt as number) : 0
    const latest = Math.max(activityMs, taskLogMs)
    if (!latest) return null
    return new Date(latest)
  }
}
