import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PasswordService } from '../../application/auth/password.service';
import { LoginDto } from './login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService, private readonly jwt: JwtService) {}

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() }, include: { memberships: { where: { isActive: true }, include: { tenant: true }, orderBy: { createdAt: 'asc' } } } });
    if (!user?.isActive || !(await this.passwords.verify(input.password, user.passwordHash))) throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません。');
    const membership = user.memberships[0];
    if (!membership) throw new UnauthorizedException('有効な園への所属がありません。');
    const payload = { sub: user.id, tenantId: membership.tenantId, role: membership.role, email: user.email };
    return { accessToken: await this.jwt.signAsync(payload), user: { id: user.id, email: user.email, displayName: user.displayName }, tenant: { id: membership.tenant.id, name: membership.tenant.name }, role: membership.role };
  }
}

