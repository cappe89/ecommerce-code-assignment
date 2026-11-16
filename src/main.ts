import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './setup-app';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Apply shared enterprise configurations: ValidationPipe, RequestIdInterceptor, GlobalExceptionFilter
  configureApp(app);

  // Swagger OpenAPI Documentation setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Products Microservice')
    .setDescription(
      'Production-grade e-commerce catalog microservice built with NestJS, Sequelize, and MySQL. Features strict validation, soft delete, optimistic concurrency locking, and distributed tracing.',
    )
    .setVersion('1.0')
    .addTag('products', 'Product catalog management endpoints')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Request-Id',
        in: 'header',
        description: 'Correlation ID for distributed tracing',
      },
      'X-Request-Id',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`=======================================================`);
  logger.log(`🚀 Products microservice is running on port: ${port}`);
  logger.log(`📖 Swagger docs available at: http://localhost:${port}/api/docs`);
  logger.log(`=======================================================`);
}

bootstrap();
