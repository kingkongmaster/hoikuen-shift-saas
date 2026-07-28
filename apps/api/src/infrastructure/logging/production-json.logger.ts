import type { LoggerService, LogLevel } from '@nestjs/common';

export function redactSecrets(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(password|authorization|cookie|jwt_secret|database_url)(["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1$2[REDACTED]');
}

export class ProductionJsonLogger implements LoggerService {
  private readonly ranks: Record<LogLevel, number> = { fatal: 0, error: 0, warn: 1, log: 2, debug: 3, verbose: 4 };
  private write(level: LogLevel, message: unknown, context?: string): void {
    const configured = (process.env.LOG_LEVEL ?? 'log') as LogLevel;
    if (this.ranks[level] > (this.ranks[configured] ?? this.ranks.log)) return;
    const entry = { timestamp: new Date().toISOString(), level, type: 'application', message: typeof message === 'string' ? redactSecrets(message) : 'Application event', ...(context ? { context } : {}) };
    const output = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    output.write(`${JSON.stringify(entry)}\n`);
  }
  log(message: unknown, context?: string): void { this.write('log', message, context); }
  error(message: unknown, _trace?: string, context?: string): void { this.write('error', message, context); }
  warn(message: unknown, context?: string): void { this.write('warn', message, context); }
  debug(message: unknown, context?: string): void { this.write('debug', message, context); }
  verbose(message: unknown, context?: string): void { this.write('verbose', message, context); }
}
