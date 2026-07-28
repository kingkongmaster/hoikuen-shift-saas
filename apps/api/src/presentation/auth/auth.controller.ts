import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { ChangeInitialPasswordDto } from './change-initial-password.dto';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { AllowPasswordChange } from '../../infrastructure/auth/allow-password-change.decorator';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import type { RequestWithContext } from '../../infrastructure/http/request-context.middleware';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login') @HttpCode(200) login(@Body() input: LoginDto) { return this.auth.login(input); }
  @Post('change-initial-password') @HttpCode(200) @AllowPasswordChange() @UseGuards(JwtAuthGuard, TenantAccessGuard)
  changeInitialPassword(@Req() request: Request & RequestWithContext & { user: AuthenticatedUser }, @Body() input: ChangeInitialPasswordDto) { return this.auth.changeInitialPassword(request.user, input, request.requestId); }
}
