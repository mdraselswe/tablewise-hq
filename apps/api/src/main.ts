import { createApp } from "@/app.ts";
import { loadEnv } from "@/config/env.ts";
import { createContainer } from "@/container.ts";
import { migrate } from "@/platform/db/migrator.ts";
import { createLogger } from "@/platform/logger.ts";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);
  const container = createContainer(env, logger);

  if (env.MIGRATE_ON_BOOT) await migrate(container.db, env.MIGRATIONS_DIR, logger);

  await container.realtime.start();
  container.relay.start();

  const server = createApp(container).listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "Tablewise API listening");
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    // Close SSE streams first, otherwise server.close() waits for them forever.
    void container.realtime
      .stop()
      .then(() => new Promise<void>((resolve) => server.close(() => resolve())))
      .then(() => container.close())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error({ err: error }, "shutdown failed");
        process.exit(1);
      });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
