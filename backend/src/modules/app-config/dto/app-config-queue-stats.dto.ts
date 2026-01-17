import { ApiProperty } from '@nestjs/swagger'

export class AppConfigQueueStatsBucketDto {
  @ApiProperty({ description: '排队长度' })
  queue: number

  @ApiProperty({ description: '执行中数量' })
  inFlight: number

  @ApiProperty({ description: '429 触发次数（累计）' })
  rateLimitCount: number

  @ApiProperty({ description: '最近一次 429 时间戳（ms）' })
  lastRateLimitAt: number

  @ApiProperty({ description: '近似 P50 请求耗时（ms）' })
  durationP50Ms: number | null

  @ApiProperty({ description: '近似 P95 请求耗时（ms）' })
  durationP95Ms: number | null

  @ApiProperty({ description: '近似 P50 排队耗时（ms）' })
  queueDelayP50Ms: number | null

  @ApiProperty({ description: '近似 P95 排队耗时（ms）' })
  queueDelayP95Ms: number | null
}

export class AppConfigQueueStatsDto {
  @ApiProperty({ description: '全局队列总量（queue + inFlight）' })
  totalPending: number

  @ApiProperty({ description: '实例标识' })
  instanceId: string

  @ApiProperty({ description: '各桶队列与并发统计' })
  buckets: Record<string, AppConfigQueueStatsBucketDto>
}
