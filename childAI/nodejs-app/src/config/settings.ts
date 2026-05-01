import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

const providerOrderSchema = z
  .string()
  .transform((s) => s.split(',').map((p) => p.trim()))
  .pipe(
    z.array(z.enum(['mock', 'litellm', 'bedrock', '9router'])).min(1)
  );

const settingsSchema = z.object({
  // App
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_HOST: z.string().default('0.0.0.0'),
  APP_PORT: z.coerce.number().int().positive().default(8000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgresql:// URL'),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid redis:// URL'),

  // Auth
  AUTH_MODE: z.enum(['jwt', 'apikey']).default('jwt'),
  JWT_ISSUER: z.string().url().optional(),
  JWT_AUDIENCE: z.string().optional(),
  JWT_JWKS_URL: z.string().url().optional(),
  DEV_API_KEY: z.string().optional(),
  DEV_JWT_SECRET: z.string().min(32).optional(),

  // AI Providers
  AI_PROVIDER_MODE: z.enum(['single', 'fallback']).default('fallback'),
  AI_PROVIDER_ORDER: providerOrderSchema.default('mock'),

  // Bedrock
  AWS_REGION: z.string().default('us-east-1'),
  BEDROCK_MODEL_ID: z.string().default('anthropic.claude-3-haiku-20240307-v1:0'),

  // LiteLLM (internal proxy — litellm.infra.adi.tech)
  LITELLM_API_BASE: z.string().url().optional(),
  LITELLM_MODEL: z.string().default('gpt-4o-mini'),
  LITELLM_API_KEY: z.string().optional(),

  // 9router (external proxy — oc.dinhdobathi.com)
  NINE_ROUTER_API_BASE: z.string().url().optional(),
  NINE_ROUTER_MODEL: z.string().default('cx/gpt-5.4'),
  NINE_ROUTER_API_KEY: z.string().optional(),

  // Safety
  SAFETY_ENABLED: z
    .string()
    .transform((s) => s === 'true')
    .default('true'),
  SAFETY_LLM_CHECK: z
    .string()
    .transform((s) => s === 'true')
    .default('false'),
  SAFETY_STREAM_MODE: z.enum(['buffered', 'sentence_gate']).default('buffered'),

  // SSE / Streaming
  SSE_HEARTBEAT_SECONDS: z.coerce.number().int().positive().default(15),
  AI_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(512),

  // Observability
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('childai-nodejs'),
});

function loadSettings() {
  const result = settingsSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[config] Startup configuration is invalid:');
    for (const issue of result.error.issues) {
      console.error(`  [${issue.path.join('.')}] ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const settings = loadSettings();
export type Settings = typeof settings;
