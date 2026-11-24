import { z } from "zod";

/**
 * The only place that reads process.env (ESLint enforces it).
 * Every variable is validated at startup, so a misconfigured deploy fails fast
 * with a clear message instead of failing later on the first request.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_SSL: z.stringbool().default(false),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(7 * 24 * 60)
    .default(12 * 60),

  /** Set behind a reverse proxy (Render, Nginx) so secure cookies and client IPs work. */
  TRUST_PROXY: z.stringbool().default(false),
  /** Secure flag on the session cookie. Unset = on in production, off elsewhere. */
  COOKIE_SECURE: z.stringbool().optional(),
  /** When set, the API also serves the built web app from this folder (single-container deploy). */
  WEB_DIST_DIR: z.string().optional(),

  /** Trading-day boundary used for report defaults ("today"). */
  BUSINESS_TIMEZONE: z.string().default("Asia/Dhaka"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  MIGRATIONS_DIR: z.string().default("migrations"),
  /** Apply pending migrations at startup (safe with many instances: guarded by an advisory lock). */
  MIGRATE_ON_BOOT: z.stringbool().default(true),
  /** Seeds demo data on boot when the database is empty (used by the hosted demo). */
  SEED_DEMO_DATA: z.stringbool().default(false),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}
