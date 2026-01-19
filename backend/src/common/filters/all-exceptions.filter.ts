import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { AppLogService } from '../../modules/app-log/app-log.service'

/**
 * 全局异常过滤器
 * 统一处理所有异常，返回标准化的错误响应
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  constructor(private readonly appLogService: AppLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    // 判断异常类型
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    // 获取错误消息
    const message = exception instanceof HttpException ? exception.message : '服务器内部错误'

    // 获取详细错误信息（开发环境）
    const errorResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' }

    // 构建响应体
    const responseBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      ...(process.env.NODE_ENV === 'development' && {
        error: errorResponse,
      }),
    }

    // 记录错误日志
    this.logger.error(
      `${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception)
    )
    void this.appLogService.recordErrorLog({
      sessionId: extractSessionId(request),
      message,
      statusCode: status,
      method: request.method,
      path: request.url,
      stack: exception instanceof Error ? exception.stack : undefined,
      error: errorResponse,
    })

    // 发送响应
    response.status(status).json(responseBody)
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
