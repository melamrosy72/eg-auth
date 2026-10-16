import { z } from 'zod'

// specs/04 §1: the only password-policy implementation (mirrors server/src/auth/password-rules.ts).
// Unicode-aware; length is counted in code points ([...v].length), not UTF-16 code units.
export const PASSWORD_RULES = {
  length: (v: string) => {
    const n = [...v].length
    return n >= 8 && n <= 128
  },
  letter: (v: string) => /\p{L}/u.test(v),
  number: (v: string) => /\p{N}/u.test(v),
  special: (v: string) => /[^\p{L}\p{N}]/u.test(v),
}

// specs/04 §1: the same text the server returns.
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
}

const codePoints = (v: string) => [...v].length

// Trim and lowercase before the format check; z.email().trim() would validate the untrimmed value.
const email = z
  .string({ error: MESSAGES.email })
  .trim()
  .toLowerCase()
  .pipe(z.email(MESSAGES.email).max(254, MESSAGES.email))

export const signInSchema = z.object({
  email,
  // No policy check at signin (specs/04 §1). Never trimmed.
  password: z
    .string({ error: MESSAGES.passwordRequired })
    .min(1, MESSAGES.passwordRequired)
    .refine((v) => codePoints(v) <= 128, MESSAGES.passwordMax),
})

export const signUpSchema = z.object({
  name: z.string({ error: MESSAGES.nameMin }).trim().min(3, MESSAGES.nameMin).max(50, MESSAGES.nameMax),
  email,
  password: z.string({ error: MESSAGES.passwordMin }).superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (!PASSWORD_RULES.length(v)) fail(codePoints(v) < 8 ? MESSAGES.passwordMin : MESSAGES.passwordMax)
    if (!PASSWORD_RULES.letter(v)) fail(MESSAGES.passwordLetter)
    if (!PASSWORD_RULES.number(v)) fail(MESSAGES.passwordNumber)
    if (!PASSWORD_RULES.special(v)) fail(MESSAGES.passwordSpecial)
  }),
})

export type SignInValues = z.input<typeof signInSchema>
export type SignUpValues = z.input<typeof signUpSchema>
