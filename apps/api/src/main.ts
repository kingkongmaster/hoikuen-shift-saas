import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import { SafeExceptionFilter } from './infrastructure/http/safe-exception.filter';
import { ProductionJsonLogger } from './infrastructure/logging/production-json.logger';
import { configuredOrigins, isOriginAllowed } from './infrastructure/http/cors-origin';
import { RequestContextMiddleware } from './infrastructure/http/request-context.middleware';
import { SecurityHeadersMiddleware } from './infrastructure/http/security-headers.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false, ...(process.env.NODE_ENV === 'production' ? { logger: new ProductionJsonLogger() } : {}) });
  const server = app.getHttpAdapter().getInstance();
  server.set('trust proxy', process.env.NODE_ENV === 'production' ? Number(process.env.TRUST_PROXY) : Number(process.env.TRUST_PROXY ?? 0));
  server.disable('x-powered-by');
  const requestContext = new RequestContextMiddleware();
  const securityHeaders = new SecurityHeadersMiddleware();
  app.use(requestContext.use.bind(requestContext));
  app.use(securityHeaders.use.bind(securityHeaders));
  app.use(json({ limit: '10mb' }));
  app.setGlobalPrefix('api');
  const origins = configuredOrigins(process.env.WEB_ORIGIN);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => callback(null, isOriginAllowed(origin, origins)),
    credentials: false,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new SafeExceptionFilter());
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  await app.listen(Number(process.env.PORT ?? process.env.API_PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
