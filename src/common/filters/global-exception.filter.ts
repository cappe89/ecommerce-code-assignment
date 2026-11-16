import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { UniqueConstraintError, OptimisticLockError, DatabaseError } from 'sequelize';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request as any)?.requestId ||
      (request.headers?.['x-request-id'] as string) ||
      'unknown-request';

    // Ensure X-Request-Id header is present on error responses as well
    if (requestId && !response.getHeader('X-Request-Id')) {
      response.setHeader('X-Request-Id', requestId);
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'An unexpected internal error occurred.';

    const isUniqueConstraint =
      exception instanceof UniqueConstraintError ||
      (exception as any)?.name === 'SequelizeUniqueConstraintError';

    const isOptimisticLock =
      exception instanceof OptimisticLockError ||
      (exception as any)?.name === 'SequelizeOptimisticLockError';

    if (isUniqueConstraint) {
      status = HttpStatus.CONFLICT;
      error = 'Conflict';
      const uniqueEx = exception as UniqueConstraintError;
      const details = uniqueEx.errors?.map((e) => e.message).join(', ');
      message = details || 'A resource with the specified unique identifier already exists.';
    } else if (isOptimisticLock) {
      status = HttpStatus.CONFLICT;
      error = 'Conflict';
      message =
        'Resource conflict: The product was modified concurrently. Please refresh the latest data and retry your update.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        error = exception.name.replace('Exception', '');
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, any>;
        message = body.message || exception.message;
        error = body.error || exception.name.replace('Exception', '');
      }
    } else if (exception instanceof DatabaseError || (exception as any)?.name === 'SequelizeDatabaseError') {
      const dbErr = exception as DatabaseError;
      // Handle MySQL check constraint violation or table constraints
      if ((dbErr.original as any)?.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
        status = HttpStatus.BAD_REQUEST;
        error = 'Bad Request';
        message = 'Database integrity check constraint violated.';
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        error = 'Database Error';
        message = 'A database error occurred while processing the request.';
      }
    } else if (exception instanceof Error) {
      message = exception.message || 'An internal error occurred.';
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url,
      error,
      message,
      requestId,
    };

    if (status >= 500) {
      this.logger.error(
        `[${requestId}] ${request.method} ${request.originalUrl} - Status: ${status} - Error: ${
          exception instanceof Error ? exception.stack : JSON.stringify(exception)
        }`,
      );
    } else {
      this.logger.warn(
        `[${requestId}] ${request.method} ${request.originalUrl} - Status: ${status} - Message: ${JSON.stringify(
          message,
        )}`,
      );
    }

    response.status(status).json(errorResponse);
  }
}
