import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** One document per issued refresh token; stores the jti, never the token (specs/04 §4.3). */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class RefreshSession {
  @Prop({ required: true, unique: true })
  jti!: string;

  @Prop({ required: true, index: true })
  familyId!: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  rotatedAt?: Date;

  @Prop()
  replacedByJti?: string;

  @Prop()
  revokedAt?: Date;
}

export const RefreshSessionSchema =
  SchemaFactory.createForClass(RefreshSession);
// TTL index: Mongo deletes sessions once expiresAt passes.
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
