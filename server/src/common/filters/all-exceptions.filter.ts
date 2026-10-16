import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import type { ErrorRequestHandler, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

/** specs/03 §1; a class so Swagger can document it. */
export class ErrorResponse {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    description: 'string[] only for validation errors',
    example: ['Please enter a valid email address'],
  })
  message!: string | string[];

  @ApiProperty({ example: '/api/v1/auth/signup' })
  path!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '3f0c1f0e-6a3b-4b8e-9c1d-2f4a5b6c7d8e' })
  requestId!: string;
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
