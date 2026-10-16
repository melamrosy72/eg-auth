import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ErrorRequestHandler, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

/** specs/03 §1 */
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId: string;
}

/**
 * Registered right after the JSON body parser. Converts its errors into HttpExceptions
 * with fixed messages; otherwise Nest wraps JSON SyntaxErrors with a message that
 * quotes the request body (which can contain a password).
 */
export const bodyParserErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  _res,
  next,
) => {
  const { status, expose, type } = (error ?? {}) as Record<string, unknown>;
  if (type === 'entity.parse.failed') {
    return next(new HttpException('Malformed JSON request body', 400));
  }
  if (
    expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  ) {
    return next(new HttpException(STATUS_CODES[status] ?? 'Error', status));
  }
  next(error);
};

function isMessage(value: unknown): value is string | string[] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((v) => typeof v === 'string'))
  );
}

/** Turns every error into an ErrorResponse; 5xx details never reach the client (specs/04 §7). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : isMessage((body as { message?: unknown }).message)
            ? (body as { message: string | string[] }).message
            : undefined;
    } else {
      this.logger.error(exception);
    }

    if (statusCode >= 500) {
      message =
        statusCode === 500 ? 'Internal server error' : STATUS_CODES[statusCode];
    }

    // Errors raised before the logger middleware (e.g. body parsing) have no id yet.
    let requestId = request.id;
    if (typeof requestId !== 'string') {
      requestId = randomUUID();
      response.setHeader('x-request-id', requestId);
    }

    const error = STATUS_CODES[statusCode] ?? 'Error';
    const body: ErrorResponse = {
      statusCode,
      error,
      message: message ?? error,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
      requestId: requestId as string,
    };
    response.status(statusCode).json(body);
  }
}
