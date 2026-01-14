import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class ConfigurationService {
  constructor(private readonly configService: ConfigService) {}

  get nodeEnv(): string {
    return this.configService.get<string>('nodeEnv') || 'development'
  }

  get port(): number {
    return this.configService.get<number>('port') || 5181
  }

  get apiPrefix(): string {
    return this.configService.get<string>('apiPrefix') || 'api'
  }

  get postgresUrl(): string {
    return this.configService.get<string>('postgres.url') || ''
  }

  get mongoUrl(): string {
    return this.configService.get<string>('mongo.url') || ''
  }

  get aiConfig() {
    return {
      glm: {
        apiKey: this.configService.get<string>('ai.glm.apiKey') || '',
        endpoint: this.configService.get<string>('ai.glm.endpoint') || '',
      },
    }
  }
}
