import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('file:./data/torus.db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().min(32).default('dev-secret-change-me-in-production-please-thanks'),

  STORAGE_DRIVER: z.enum(['minio', 's3', 'azure', 'gcs']).default('minio'),
  STORAGE_BUCKET: z.string().default('torus-clips'),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),

  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(209715200),
  UPLOAD_MAX_DURATION_MS: z.coerce.number().int().positive().default(1800000),
  UPLOAD_ANON_PER_HOUR: z.coerce.number().int().nonnegative().default(5),
  UPLOAD_ANON_PER_DAY: z.coerce.number().int().nonnegative().default(20),
  UPLOAD_USER_PER_DAY: z.coerce.number().int().nonnegative().default(50),
  UPLOAD_USER_QUOTA_BYTES: z.coerce.number().int().positive().default(5_368_709_120),
  EMERGENCY_STOP: z
    .string()
    .default('false')
    .transform((s) => s.toLowerCase() === 'true'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('torus.wtf <noreply@torus.wtf>'),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((s) => s.toLowerCase() === 'true'),

  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  POLAR_API_KEY: z.string().optional(),
  POLAR_WEBHOOK_SECRET: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  HEALTH_WEBHOOK_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables. See above.');
  }
  cached = parsed.data;
  return cached;
}
