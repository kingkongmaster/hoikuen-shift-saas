import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as nativeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nativeScrypt);

@Injectable()
export class PasswordService {
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

