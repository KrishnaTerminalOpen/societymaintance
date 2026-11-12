import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLogger, SentryTracker, AlertService } from '@colony/shared';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    const clientIp =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.ip ||
      '127.0.0.1';

    const meta = {
      context: 'HttpExceptionFilter',
      path: request.url,
      method: request.method,
      statusCode: status,
      ip: clientIp,
      userId: (request as any).user?.sub,
      error: exception,
    };

    if (status >= 500) {
      AppLogger.error(`Unhandled API error on ${request.method} ${request.url}`, meta);
      SentryTracker.captureException(exception, meta);

      if (request.url.includes('/payments') || request.url.includes('/webhooks')) {
        void AlertService.sendAlert({
          title: 'Unhandled Payment/Webhook Exception',
          severity: 'CRITICAL',
          service: request.url.includes('/webhooks') ? 'webhooks' : 'payments',
          message: typeof message === 'string' ? message : JSON.stringify(message),
          details: { path: request.url, method: request.method, statusCode: status },
        });
      }
    } else {
      AppLogger.warn(`Client error (${status}) on ${request.method} ${request.url}`, meta);
    }

    response.status(status).json(
      typeof message === 'object'
        ? { ...message, timestamp: new Date().toISOString(), path: request.url }
        : { statusCode: status, message, timestamp: new Date().toISOString(), path: request.url },
    );
  }
}

