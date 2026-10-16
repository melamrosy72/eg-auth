import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

/** The only user shape that leaves the server (specs/03 §1). */
export type SafeUser = { id: string; name: string; email: string };

/** Explicit mapping: never return documents or rely on toJSON transforms. */
export function toSafeUser(user: UserDocument): SafeUser {
  return { id: user._id.toString(), name: user.name, email: user.email };
}
