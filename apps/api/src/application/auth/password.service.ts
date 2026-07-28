import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as nativeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nativeScrypt);

@Injectable()
export class PasswordService {
  validateNewPassword(password: string, identity: { email: string; displayName: string }): string | null {
    if (password !== password.trim()) return 'パスワードの先頭と末尾に空白は使用できません。';
    if (password.length < 12 || password.length > 128) return '新しいパスワードは12文字以上128文字以下で入力してください。';
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) return '新しいパスワードには英大文字、英小文字、数字、記号をそれぞれ含めてください。';
    const normalized = password.toLocaleLowerCase();
    if (normalized === identity.email.toLocaleLowerCase() || normalized === identity.displayName.trim().toLocaleLowerCase()) return 'メールアドレスや表示名と同じパスワードは使用できません。';
    return null;
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const digest = await scrypt(password, salt, 64) as Buffer;
    return `${salt}:${digest.toString('hex')}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const [salt, stored] = encoded.split(':');
    if (!salt || !stored) return false;
    const digest = await scrypt(password, salt, 64) as Buffer;
    const expected = Buffer.from(stored, 'hex');
    return expected.length === digest.length && timingSafeEqual(expected, digest);
  }
}
