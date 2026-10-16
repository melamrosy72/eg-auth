import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { isEmail, IsString, ValidateBy } from 'class-validator';
import { PASSWORD_RULES } from '../password-rules.js';

// specs/04 §1: the exact messages the client shows too.
export const MESSAGES = {
  email: 'Please enter a valid email address',
  nameMin: 'Name must be at least 3 characters',
  nameMax: 'Name must be at most 50 characters',
  passwordMin: 'Password must be at least 8 characters',
  passwordMax: 'Password must be at most 128 characters',
  passwordLetter: 'Password must contain at least one letter',
  passwordNumber: 'Password must contain at least one number',
  passwordSpecial: 'Password must contain at least one special character',
  passwordRequired: 'Password is required',
} as const;

const codePoints = (value: string) => [...value].length;

/**
 * A rule that only judges strings. Each field's @IsString carries that field's first
 * message, so a missing or non-string field reports exactly one message instead of
 * every rule failing at once.
 */
function Rule(
  name: string,
  check: (value: string) => boolean,
  message: string | ((value: string) => string),
) {
  return ValidateBy({
    name,
    validator: {
      validate: (value: unknown) => typeof value !== 'string' || check(value),
      defaultMessage: (args) =>
        typeof message === 'string' ? message : message(String(args?.value)),
    },
  });
}

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

// Transforms run before validation, so "   ab  " fails the name length check.
const EmailField = () =>
  applyDecorators(
    ApiProperty({ example: 'mahmoud@example.com', maxLength: 254 }),
    Transform(normalizeEmail),
    IsString({ message: MESSAGES.email }),
    Rule('email', (v) => v.length <= 254 && isEmail(v), MESSAGES.email),
  );

export class SignupDto {
  @ApiProperty({ example: 'Mahmoud', minLength: 3, maxLength: 50 })
  @Transform(trim)
  @IsString({ message: MESSAGES.nameMin })
  @Rule('nameMin', (v) => v.length >= 3, MESSAGES.nameMin)
  @Rule('nameMax', (v) => v.length <= 50, MESSAGES.nameMax)
  name!: string;

  @EmailField()
  email!: string;

  // Never trimmed or normalised. Lengths count code points.
  @ApiProperty({
    example: 'Example!123',
    minLength: 8,
    maxLength: 128,
    description:
      'At least one letter, one number and one special character (whitespace counts as special).',
  })
  @IsString({ message: MESSAGES.passwordMin })
  @Rule('passwordLength', PASSWORD_RULES.length, (v) =>
    codePoints(v) < 8 ? MESSAGES.passwordMin : MESSAGES.passwordMax,
  )
  @Rule('passwordLetter', PASSWORD_RULES.letter, MESSAGES.passwordLetter)
  @Rule('passwordNumber', PASSWORD_RULES.number, MESSAGES.passwordNumber)
  @Rule('passwordSpecial', PASSWORD_RULES.special, MESSAGES.passwordSpecial)
  password!: string;
}

/** No password policy at signin (specs/04 §1). */
export class SigninDto {
  @EmailField()
  email!: string;

  @ApiProperty({ example: 'Example!123', minLength: 1, maxLength: 128 })
  @IsString({ message: MESSAGES.passwordRequired })
  @Rule('passwordRequired', (v) => v.length > 0, MESSAGES.passwordRequired)
  @Rule('passwordMax', (v) => codePoints(v) <= 128, MESSAGES.passwordMax)
  password!: string;
}

export class SafeUserDto {
  @ApiProperty({ example: '665f1c2e9b1d8a0012345678' })
  id!: string;

  @ApiProperty({ example: 'Mahmoud' })
  name!: string;

  @ApiProperty({ example: 'mahmoud@example.com' })
  email!: string;
}

export class UserResponseDto {
  @ApiProperty({ type: SafeUserDto })
  user!: SafeUserDto;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Access token refreshed.' })
  message!: string;
}
