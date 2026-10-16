import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Thin injectable wrapper around argon2, so unit tests replace it through DI
 * (ESM namespace exports are read-only and can't be spied on).
 */
@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
