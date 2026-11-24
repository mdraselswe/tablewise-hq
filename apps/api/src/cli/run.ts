import { loadEnv } from "@/config/env.ts";
import { type Container, createContainer } from "@/container.ts";
import { createLogger } from "@/platform/logger.ts";

/** Boots the container for a one-off command, runs it, and always closes connections. */
export async function runCommand(
  name: string,
  command: (container: Container) => Promise<void>,
): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({ ...env, NODE_ENV: env.NODE_ENV === "test" ? "development" : env.NODE_ENV });
  const container = createContainer(env, logger);
  try {
    await command({ ...container, logger });
    logger.info(`${name}: done`);
  } catch (error) {
    logger.error({ err: error }, `${name}: failed`);
    process.exitCode = 1;
  } finally {
    await container.close();
  }
}
