import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { RefreshSessionService } from './refresh-session.service.js';
import { TokenService } from './token.service.js';

const DUMMY_HASH = '$argon2id$dummy';
const USER_HASH = '$argon2id$user';

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'Mahmoud',
    email: 'mahmoud@example.com',
    passwordHash: USER_HASH,
    ...overrides,
  };
}

async function setup() {
  const userModel = { create: vi.fn(), findOne: vi.fn() };
  const hasher = {
    hash: vi.fn(async (pw: string) =>
      pw === 'Example!123' ? USER_HASH : DUMMY_HASH,
    ),
    verify: vi.fn(
      async (hash: string, pw: string) =>
        hash === USER_HASH && pw === 'Example!123',
    ),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      UsersService, // real, so the 11000 mapping is exercised
      { provide: getModelToken(User.name), useValue: userModel },
      { provide: PasswordHasher, useValue: hasher },
      {
        provide: TokenService,
        useValue: {
          signAccess: async () => 'access',
          signRefresh: async () => 'refresh',
        },
      },
      {
        provide: RefreshSessionService,
        useValue: {
          createFamily: async () => ({ jti: 'jti', familyId: 'fid' }),
        },
      },
    ],
  }).compile();
  await moduleRef.init(); // runs onModuleInit → dummy hash
  const findOneReturns = (doc: unknown) =>
    userModel.findOne.mockReturnValue({
      select: () => ({ exec: async () => doc }),
    });
  return {
    auth: moduleRef.get(AuthService),
    userModel,
    hasher,
    findOneReturns,
  };
}

const SIGNUP = {
  name: 'Mahmoud',
  email: 'mahmoud@example.com',
  password: 'Example!123',
};

describe('AuthService.signup', () => {
  it('stores the hasher output and returns a safe user without passwordHash', async () => {
    const { auth, userModel, hasher } = await setup();
    const doc = userDoc();
    userModel.create.mockResolvedValue(doc);

    const result = await auth.signup(SIGNUP);

    expect(hasher.hash).toHaveBeenCalledWith('Example!123');
    expect(userModel.create).toHaveBeenCalledWith({
      name: 'Mahmoud',
      email: 'mahmoud@example.com',
      passwordHash: USER_HASH,
    });
    expect(result.user).toEqual({
      id: doc._id.toString(),
      name: 'Mahmoud',
      email: 'mahmoud@example.com',
    });
    expect(result.tokens).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('maps Mongo duplicate key error 11000 to ConflictException', async () => {
    const { auth, userModel } = await setup();
    userModel.create.mockRejectedValue(
      Object.assign(new Error('E11000'), {
        code: 11000,
        keyPattern: { email: 1 },
      }),
    );

    await expect(auth.signup(SIGNUP)).rejects.toThrow(
      new ConflictException('Email is already registered'),
    );
  });

  it('rethrows a duplicate key error on an index other than email', async () => {
    const { auth, userModel } = await setup();
    const error = Object.assign(new Error('E11000 _id'), {
      code: 11000,
      keyPattern: { _id: 1 },
    });
    userModel.create.mockRejectedValue(error);
    await expect(auth.signup(SIGNUP)).rejects.toBe(error);
  });

  it('rethrows other database errors', async () => {
    const { auth, userModel } = await setup();
    userModel.create.mockRejectedValue(new Error('connection lost'));
    await expect(auth.signup(SIGNUP)).rejects.toThrow('connection lost');
  });
});

describe('AuthService.signin', () => {
  it('unknown email → 401 and still verifies against the dummy hash', async () => {
    const { auth, hasher, findOneReturns } = await setup();
    findOneReturns(null);

    await expect(
      auth.signin({ email: 'nobody@example.com', password: 'Example!123' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    expect(hasher.verify).toHaveBeenCalledWith(DUMMY_HASH, 'Example!123');
  });

  it('wrong password → the same 401 message', async () => {
    const { auth, hasher, findOneReturns } = await setup();
    findOneReturns(userDoc());

    await expect(
      auth.signin({ email: 'mahmoud@example.com', password: 'wrong' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    expect(hasher.verify).toHaveBeenCalledWith(USER_HASH, 'wrong');
  });

  it('success returns the safe user and tokens', async () => {
    const { auth, findOneReturns } = await setup();
    const doc = userDoc();
    findOneReturns(doc);

    const result = await auth.signin({
      email: 'mahmoud@example.com',
      password: 'Example!123',
    });

    expect(result.user).toEqual({
      id: doc._id.toString(),
      name: 'Mahmoud',
      email: 'mahmoud@example.com',
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.tokens).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });
});

describe('PasswordHasher', () => {
  it('hashes with argon2id and verifies', async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash('Example!123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 'Example!123')).toBe(true);
    expect(await hasher.verify(hash, 'example!123')).toBe(false);
  });
});
