import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithContext = Request & { requestId?: string; user?: { sub?: string; tenantId?: string } };

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    request.requestId = randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    const started = process.hrtime.bigint();
    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const level = response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'log';
      const entry = {
        timestamp: new Date().toISOString(), level, type: 'http_request',
        requestId: request.requestId, method: request.method, path: request.path, status: response.statusCode,
        durationMs: Number(durationMs.toFixed(1)), ...(request.user?.sub ? { userId: request.user.sub } : {}),
        ...(request.user?.tenantId ? { tenantId: request.user.tenantId } : {}),
      };
      const ranks = { error: 0, warn: 1, log: 2, debug: 3, verbose: 4 } as const;
      const configured = (process.env.LOG_LEVEL ?? 'log') as keyof typeof ranks;
      if (process.env.NODE_ENV === 'production' && ranks[level] <= (ranks[configured] ?? ranks.log)) (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${JSON.stringify(entry)}\n`);
      else if (process.env.LOG_HTTP_REQUESTS === 'true') process.stdout.write(`[http] ${entry.requestId} ${entry.method} ${entry.path} ${entry.status} ${entry.durationMs}ms\n`);
    });
    next();
  }
}
