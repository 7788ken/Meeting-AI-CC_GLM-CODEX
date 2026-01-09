import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  })

  const configService = app.get(ConfigService)

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )

  // CORS配置
  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || '*',
    credentials: true,
  })

  // 全局路由前缀
  app.setGlobalPrefix(configService.get('API_PREFIX') || 'api')

  // Swagger API文档
  const config = new DocumentBuilder()
    .setTitle('AI会议助手 API')
    .setDescription('提供实时语音转写和AI分析功能')
    .setVersion('1.0')
    .addTag('sessions', '会话管理')
    .addTag('speeches', '发言记录')
    .addTag('analysis', 'AI分析')
    .addTag('transcript', '实时转写')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  const port = configService.get<number>('PORT') || 3000
  await app.listen(port)

  console.log(`🚀 Server running on http://localhost:${port}`)
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`)
}

bootstrap()
