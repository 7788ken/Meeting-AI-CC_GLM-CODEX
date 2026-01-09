import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHealthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }

  getHealthCheckDetail() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: this.configService.get('NODE_ENV'),
      version: '1.0.0',
    }
  }
}
