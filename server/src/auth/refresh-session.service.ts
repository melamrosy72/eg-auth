import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { REFRESH_TOKEN_TTL_SECONDS } from './auth.constants.js';
import { RefreshSession } from './refresh-session.schema.js';

/**
 * Session state for refresh rotation (specs/04 §4.3–§4.5). Only single-document atomic
 * operations: the Compose Mongo is standalone, so there are no transactions.
 */
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
    await this.insert(jti, familyId, userId, new Date());
    return { jti, familyId };
  }

  /** The next token in a family; sliding 7-day expiry from `now`. */
  async insert(
    jti: string,
    familyId: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.sessionModel.create({
      jti,
      familyId,
      userId: new Types.ObjectId(userId),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
  }

  /**
   * Atomically marks `jti` as rotated if it is still usable. Only one concurrent
   * request can win; the others get null (specs/04 §4.4 step 2).
   */
  async claim(jti: string, newJti: string, now: Date): Promise<boolean> {
    const claimed = await this.sessionModel
      .findOneAndUpdate(
        { jti, revokedAt: null, rotatedAt: null, expiresAt: { $gt: now } },
        { $set: { rotatedAt: now, replacedByJti: newJti } },
        { returnDocument: 'after' },
      )
      .exec();
    return claimed !== null;
  }

  findByJti(jti: string) {
    return this.sessionModel.findOne({ jti }).lean().exec();
  }

  /** Revokes every still-active session in the family (logout, reuse, deleted user). */
  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.sessionModel
      .updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: now } })
      .exec();
  }
}
