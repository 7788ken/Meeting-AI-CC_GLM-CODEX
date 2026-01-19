import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { AppLogService } from '../../modules/app-log/app-log.service'

@Injectable()
export class AppLogInterceptor implements NestInterceptor {
  constructor(private readonly appLogService: AppLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle()
    }

    const httpContext = context.switchToHttp()
    const request = httpContext.getRequest<Request>()
    const response = httpContext.getResponse<Response>()
    const startAt = Date.now()
    const sessionId = extractSessionId(request)

    return next.handle().pipe(
      tap({
        next: data => {
          void this.appLogService.recordRequestResponseLog({
            sessionId,
            method: request.method,
            path: request.originalUrl || request.url,
            statusCode: response.statusCode,
            durationMs: Date.now() - startAt,
            request: {
              params: request.params,
              query: request.query,
              body: request.body,
            },
            response: {
              body: data,
            },
            ip: request.ip,
            userAgent: request.get('user-agent') || undefined,
          })
        },
      })
    )
  }
}

function extractSessionId(request: Request): string | undefined {
  const candidates = [
    request.params?.sessionId,
    request.query?.sessionId,
    (request.body as { sessionId?: unknown } | undefined)?.sessionId,
    request.headers['x-session-id'],
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return undefined
}
