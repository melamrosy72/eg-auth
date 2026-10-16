import { z } from 'zod';

// Never z.coerce.boolean(): it turns the string "false" into true.
const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const secret = z.string().min(32, 'must be at least 32 characters');

function isExactOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // Regex rather than z.url(): WHATWG URL parsing rejects multi-host replica-set URIs.
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\/\S+$/, 'must be a mongodb:// URI'),
    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    FRONTEND_ORIGINS: z
      .string()
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(
        z
          .array(
            z
              .string()
              .refine(
                isExactOrigin,
                'must be an exact origin like http://localhost:5173 (no path, no trailing slash, no *)',
              ),
          )
          .min(1),
      ),
    COOKIE_SECURE: booleanString,
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SWAGGER_ENABLED: booleanString.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Passed to ConfigModule.forRoot({ validate }). Parses the `config` argument, which
 * @nestjs/config builds from `.env` merged under `process.env` before it copies
 * anything into `process.env`. The error lists variable names and issue messages
 * only, never the received values.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
