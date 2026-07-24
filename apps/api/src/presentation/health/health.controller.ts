import { Controller, Get } from '@nestjs/common';
import { PostgresDatabase } from '../../infrastructure/database/postgres.database';

@Controller('health')
export class HealthController {
  constructor(private readonly database: PostgresDatabase) {}

  @Get()
  async getHealth(): Promise<{ status: 'ok'; database: 'up' | 'down' }> {
    return { status: 'ok', database: (await this.database.ping()) ? 'up' : 'down' };
  }
}

