import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
@Injectable()
export class TechnicalJsonGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.RELEASE_CHANNEL === 'musubi-beta') {
      throw new ForbiddenException('この環境では利用できません。運用窓口へお問い合わせください。');
    }
    return true;
  }
}
