import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

/**
 * Shared configuration function to set up global pipes, interceptors, and filters.
 * Reused in both src/main.ts and test/products.e2e-spec.ts to guarantee identical behavior.
 */
export function configureApp(app: INestApplication): void {
  // Global Request ID interceptor for distributed tracing / correlation
  app.useGlobalInterceptors(new RequestIdInterceptor());

  // Global Exception filter mapping Sequelize errors and standardizing error JSON
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Strict ValidationPipe preventing mass assignment and payload pollution
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
}
