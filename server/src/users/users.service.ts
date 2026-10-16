import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { User, type UserDocument } from './user.schema.js';

const DUPLICATE_KEY = 11000;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  /** The unique email index enforces uniqueness, including under concurrent signups (specs/04 §2). */
  async create(data: User): Promise<UserDocument> {
    try {
      return await this.userModel.create(data);
    } catch (error) {
      // Only the email index means "already registered"; any other duplicate key is a bug.
      const { code, keyPattern } = error as {
        code?: unknown;
        keyPattern?: Record<string, unknown>;
      };
      if (code === DUPLICATE_KEY && keyPattern?.email !== undefined) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  /** The only query that loads passwordHash (signin). */
  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).select('+passwordHash').exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    if (!isValidObjectId(id)) return Promise.resolve(null);
    return this.userModel.findById(id).exec();
  }
}
