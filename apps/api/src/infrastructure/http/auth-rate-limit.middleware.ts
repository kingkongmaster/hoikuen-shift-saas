import { Injectable, NestMiddleware } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class AuthRateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();
  private requestCount = 0;
  private readonly windowMs = this.positiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60_000);
  private readonly ipLimit = this.positiveInteger(process.env.AUTH_RATE_LIMIT_IP_MAX, 20);
  private readonly accountLimit = this.positiveInteger(process.env.AUTH_RATE_LIMIT_ACCOUNT_MAX, 10);
  private readonly maxBuckets = this.positiveInteger(process.env.AUTH_RATE_LIMIT_MAX_BUCKETS, 10_000);

  use(request: Request, response: Response, next: NextFunction): void {
    if (process.env.NODE_ENV !== 'production' && process.env.RATE_LIMIT_ENABLED !== 'true') return next();
    const now = Date.now();
    this.requestCount += 1;
    if (this.requestCount % 100 === 0 || this.buckets.size >= this.maxBuckets) this.removeExpired(now);
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const keys: Array<[string, number]> = [[`ip:${ip}`, this.ipLimit]];
    if (email) keys.push([`account:${createHash('sha256').update(email).digest('hex')}`, this.accountLimit]);
    for (const [key, limit] of keys) {
      const bucket = this.buckets.get(key);
      if (bucket && bucket.resetAt > now && bucket.count >= limit) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
        response.status(429).json({ statusCode: 429, message: '試行回数が上限に達しました。時間をおいて再試行してください。', requestId: (request as Request & { requestId?: string }).requestId });
        return;
      }
    }
    for (const [key] of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket && this.buckets.size >= this.maxBuckets) this.buckets.delete(this.buckets.keys().next().value as string);
      this.buckets.set(key, !bucket || bucket.resetAt <= now ? { count: 1, resetAt: now + this.windowMs } : { ...bucket, count: bucket.count + 1 });
    }
    next();
  }

  private removeExpired(now: number): void { for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key); }
  private positiveInteger(value: string | undefined, fallback: number): number { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback; }
}
