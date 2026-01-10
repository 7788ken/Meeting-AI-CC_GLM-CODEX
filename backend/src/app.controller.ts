import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AppService } from './app.service'
import { Public } from './modules/auth/decorators/public.decorator'

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '健康检查' })
  healthCheck() {
    return this.appService.getHealthCheck()
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: '详细健康检查' })
  healthCheckDetail() {
    return this.appService.getHealthCheckDetail()
  }
}
