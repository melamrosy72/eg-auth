import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { REFRESH_TOKEN_TTL_SECONDS } from './auth.constants.js';
import { RefreshSession } from './refresh-session.schema.js';

@Injectable()
export class RefreshSessionService {
  constructor(
    @InjectModel(RefreshSession.name)
    private readonly sessionModel: Model<RefreshSession>,
  ) {}

  /** A new family per signup/signin, so each device has its own (specs/04 §4.3). */
  async createFamily(
    userId: string,
  ): Promise<{ jti: string; familyId: string }> {
    const jti = randomUUID();
    const familyId = randomUUID();
    await this.sessionModel.create({
      jti,
      familyId,
      userId: new Types.ObjectId(userId),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    return { jti, familyId };
  }
}
