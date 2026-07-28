import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../../application/auth/password.service';
import { JwtStrategy } from '../../infrastructure/auth/jwt.strategy';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';

@Module({
  imports: [JwtModule.registerAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET'), signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '8h') as `${number}${'s' | 'm' | 'h' | 'd'}` } }) })],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, JwtStrategy, JwtAuthGuard, TenantAccessGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, TenantAccessGuard, RolesGuard],
})
export class AuthModule {}
