import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PostgresDatabase } from '../../infrastructure/database/postgres.database';

@Controller('ready')
export class ReadinessController {
  constructor(private readonly database: PostgresDatabase) {}

  @Get()
  async getReadiness(): Promise<{ status: 'ready'; database: 'up' }> {
    if (!(await this.database.ping())) throw new ServiceUnavailableException('Service is not ready');
    return { status: 'ready', database: 'up' };
  }
}
