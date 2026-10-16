import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MESSAGES, SigninDto, SignupDto } from './auth.dto.js';

const VALID = {
  name: 'Mahmoud',
  email: 'mahmoud@example.com',
  password: 'Example!123',
};

async function check<T extends object>(cls: new () => T, body: object) {
  const dto = plainToInstance(cls, body);
  const errors = await validate(dto);
  const messages = (field: string) =>
    Object.values(
      errors.find((e) => e.property === field)?.constraints ?? {},
    ).sort();
  return { dto, messages };
}

describe('SignupDto password', () => {
  it.each([
    'abc12345!',
    'مرحبا123!',
    'abc 1234', // space is the special character
    'abc1234\n', // newline is the special character
    'a1' + '😀'.repeat(6), // 8 code points, 14 code units
    'a1' + '😀'.repeat(126), // 128 code points
  ])('accepts %j', async (password) => {
    const { messages } = await check(SignupDto, { ...VALID, password });
    expect(messages('password')).toEqual([]);
  });

  it.each([
    ['abcdefgh', [MESSAGES.passwordNumber, MESSAGES.passwordSpecial]],
    ['12345678!', [MESSAGES.passwordLetter]],
    ['abcdefg1', [MESSAGES.passwordSpecial]],
    ['a1!', [MESSAGES.passwordMin]],
    ['a1!' + 'x'.repeat(126), [MESSAGES.passwordMax]], // 129 characters
    ['a1' + '😀'.repeat(127), [MESSAGES.passwordMax]], // 129 code points
  ])('rejects %j', async (password, expected) => {
    const { messages } = await check(SignupDto, { ...VALID, password });
    expect(messages('password')).toEqual([...expected].sort());
  });

  it('is never trimmed', async () => {
    const { dto } = await check(SignupDto, {
      ...VALID,
      password: '  abc123!  ',
    });
    expect(dto.password).toBe('  abc123!  ');
  });
});

describe('SignupDto name and email', () => {
  it('rejects "  ab  " after trimming', async () => {
    const { messages } = await check(SignupDto, { ...VALID, name: '  ab  ' });
    expect(messages('name')).toEqual([MESSAGES.nameMin]);
  });

  it('accepts and trims "  abc "', async () => {
    const { dto, messages } = await check(SignupDto, {
      ...VALID,
      name: '  abc ',
    });
    expect(messages('name')).toEqual([]);
    expect(dto.name).toBe('abc');
  });

  it('rejects a 51-character name', async () => {
    const { messages } = await check(SignupDto, {
      ...VALID,
      name: 'a'.repeat(51),
    });
    expect(messages('name')).toEqual([MESSAGES.nameMax]);
  });

  it('normalises "  A@X.com " to "a@x.com"', async () => {
    const { dto, messages } = await check(SignupDto, {
      ...VALID,
      email: '  A@X.com ',
    });
    expect(messages('email')).toEqual([]);
    expect(dto.email).toBe('a@x.com');
  });

  it.each(['not-an-email', 'a@', `${'a'.repeat(250)}@x.com`])(
    'rejects email %j',
    async (email) => {
      const { messages } = await check(SignupDto, { ...VALID, email });
      expect(messages('email')).toEqual([MESSAGES.email]);
    },
  );

  it('reports only the first rule message for missing or non-string fields', async () => {
    for (const body of [{}, { name: 42, email: [], password: null }]) {
      const { messages } = await check(SignupDto, body);
      expect(messages('name')).toEqual([MESSAGES.nameMin]);
      expect(messages('email')).toEqual([MESSAGES.email]);
      expect(messages('password')).toEqual([MESSAGES.passwordMin]);
    }
  });
});

describe('SigninDto', () => {
  it('accepts "short" as a password (no policy check)', async () => {
    const { messages } = await check(SigninDto, {
      email: VALID.email,
      password: 'short',
    });
    expect(messages('password')).toEqual([]);
  });

  it.each([[''], [undefined]])(
    'rejects password %j as required',
    async (password) => {
      const { messages } = await check(SigninDto, {
        email: VALID.email,
        password,
      });
      expect(messages('password')).toEqual([MESSAGES.passwordRequired]);
    },
  );

  it('rejects a password over 128 code points', async () => {
    const { messages } = await check(SigninDto, {
      email: VALID.email,
      password: '😀'.repeat(129),
    });
    expect(messages('password')).toEqual([MESSAGES.passwordMax]);
  });

  it('normalises and validates the email', async () => {
    const { dto, messages } = await check(SigninDto, {
      email: ' A@X.com',
      password: 'x',
    });
    expect(messages('email')).toEqual([]);
    expect(dto.email).toBe('a@x.com');
    expect(
      (await check(SigninDto, { password: 'x' })).messages('email'),
    ).toEqual([MESSAGES.email]);
  });
});
