import { pino, type Logger } from "pino";
import type { Env } from "@/config/env.ts";

export type { Logger };

/** Structured JSON logs in production (ready for any log pipeline); readable lines in development. */
export function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">): Logger {
  return pino({
    level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
    base: { service: "tablewise-api" },
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']", "*.password"],
      censor: "[redacted]",
    },
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } }
      : {}),
  });
}
