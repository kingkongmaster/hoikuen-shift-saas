import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class PostgresDatabase implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const readinessTimeoutMs = config.get<number>('READINESS_DB_TIMEOUT_MS') ?? 3000;
    this.pool = new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL'), connectionTimeoutMillis: readinessTimeoutMs, query_timeout: readinessTimeoutMs });
  }

  async onModuleInit(): Promise<void> {
    if (this.shouldConnectOnStartup()) await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private shouldConnectOnStartup(): boolean {
    return process.env.DATABASE_CONNECT_ON_STARTUP === 'true';
  }
}
