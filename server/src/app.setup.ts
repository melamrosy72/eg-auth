import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { bodyParserErrorHandler } from './common/filters/all-exceptions.filter.js';
import type { Env } from './config/env.schema.js';

/**
 * HTTP-level setup shared by main.ts and the integration tests, so tests boot
 * the same app that runs in production. Guards, pipe and filter live in AppModule.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.setGlobalPrefix('api');
  // Routes live under /api/v1; health and docs are VERSION_NEUTRAL (specs/02 §2).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  // Helmet defaults already allow Swagger UI: it loads its scripts and styles from 'self'.
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '10kb' });
  app.use(bodyParserErrorHandler);
  app.enableCors({
    origin: config.get('FRONTEND_ORIGINS', { infer: true }),
    credentials: true,
  });
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Easygenerator Auth API')
        .setDescription(
          'Cookie-based authentication API. Unsafe methods require an allowed Origin header.',
        )
        .setVersion('1.0')
        .addCookieAuth('access_token', undefined, 'access_token')
        .addCookieAuth('refresh_token', undefined, 'refresh_token')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  if (
    config.get('NODE_ENV', { infer: true }) === 'production' &&
    !config.get('COOKIE_SECURE', { infer: true })
  ) {
    logger.warn(
      'COOKIE_SECURE=false in production — only acceptable for local HTTP (Compose)',
    );
  }
}
