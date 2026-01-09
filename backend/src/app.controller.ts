import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AppService } from './app.service'

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: '健康检查' })
  healthCheck() {
    return this.appService.getHealthCheck()
  }

  @Get('health')
  @ApiOperation({ summary: '详细健康检查' })
  healthCheckDetail() {
    return this.appService.getHealthCheckDetail()
  }
}
