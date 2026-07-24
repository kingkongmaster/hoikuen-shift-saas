import { Global, Module } from '@nestjs/common';
import { PostgresDatabase } from './postgres.database';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PostgresDatabase, PrismaService], exports: [PostgresDatabase, PrismaService] })
export class DatabaseModule {}
