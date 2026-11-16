import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestIdInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const incomingRequestId = req.headers['x-request-id'] as string | undefined;
    const requestId = incomingRequestId && incomingRequestId.trim().length > 0
      ? incomingRequestId.trim()
      : randomUUID();

    // Attach to request object and header
    (req as any).requestId = requestId;
    req.headers['x-request-id'] = requestId;

    // Set correlation ID on the HTTP response header
    res.setHeader('X-Request-Id', requestId);

    const { method, originalUrl } = req;
    const startTime = Date.now();

    this.logger.log(`[${requestId}] --> ${method} ${originalUrl}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `[${requestId}] <-- ${method} ${originalUrl} ${res.statusCode} (+${duration}ms)`,
          );
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          this.logger.warn(
            `[${requestId}] <-- ${method} ${originalUrl} ERROR (+${duration}ms): ${err.message}`,
          );
        },
      }),
    );
  }
}
