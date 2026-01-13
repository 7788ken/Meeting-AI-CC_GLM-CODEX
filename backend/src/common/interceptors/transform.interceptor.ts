import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

/**
 * 通用响应接口 - 与前端 ApiResponse 保持一致
 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/**
 * 响应成功时使用的消息
 */
const SUCCESS_MESSAGE = '操作成功'

/**
 * Transform Interceptor - 统一包装 API 响应格式
 *
 * 将所有控制器返回值包装为 { code, message, data } 格式
 *
 * @example
 * // Controller 返回: { id: "123", name: "test" }
 * // 实际响应: { code: 200, message: "操作成功", data: { id: "123", name: "test" } }
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map(data => {
        // 如果已经是 ApiResponse 格式，直接返回
        if (
          data &&
          typeof data === 'object' &&
          'code' in data &&
          'message' in data &&
          'data' in data
        ) {
          return data as ApiResponse<T>
        }

        // 否则包装为统一格式
        return {
          code: 200,
          message: SUCCESS_MESSAGE,
          data,
        }
      })
    )
  }
}
