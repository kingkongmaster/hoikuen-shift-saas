import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './presentation/health/health.module';
import { AuthModule } from './presentation/auth/auth.module';
import { MeModule } from './presentation/me/me.module';
import { StaffModule } from './presentation/staff/staff.module';
import { RequestsModule } from './presentation/requests/requests.module';
import { ShiftsModule } from './presentation/shifts/shifts.module';
import { SettingsModule } from './presentation/settings/settings.module';
import { ClosedDatesModule } from './presentation/closed-dates/closed-dates.module';
import { NotificationsModule } from './presentation/notifications/notifications.module';
import { AuditModule } from './presentation/audit/audit.module';
import { ShiftSwapsModule } from './presentation/shift-swaps/shift-swaps.module';
import { ExportsModule } from './presentation/exports/exports.module';
import { BackupsModule } from './presentation/backups/backups.module';
import { SubscriptionsModule } from './presentation/subscriptions/subscriptions.module';
import { TenantsModule } from './presentation/tenants/tenants.module';
import { SetupModule } from './presentation/setup/setup.module';
import { AuthRateLimitMiddleware } from './infrastructure/http/auth-rate-limit.middleware';
import { FeaturesModule } from './presentation/features/features.module';
import { WorkPatternsModule } from './presentation/work-patterns/work-patterns.module';
import { StaffWorkRulesModule } from './presentation/staff-work-rules/staff-work-rules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    MeModule,
    StaffModule,
    RequestsModule,
    ShiftsModule,
    SettingsModule,
    ClosedDatesModule,
    NotificationsModule,
    AuditModule,
    ShiftSwapsModule,
    ExportsModule,
    BackupsModule,
    SubscriptionsModule,
    TenantsModule,
    SetupModule,
    FeaturesModule,
    WorkPatternsModule,
    StaffWorkRulesModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthRateLimitMiddleware).forRoutes({ path: 'auth/{*splat}', method: RequestMethod.ALL });
  }
}
