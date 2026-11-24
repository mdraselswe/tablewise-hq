import { migrate } from "@/platform/db/migrator.ts";
import { runCommand } from "./run.ts";

await runCommand("migrate", async ({ db, env, logger }) => {
  const applied = await migrate(db, env.MIGRATIONS_DIR, logger);
  logger.info({ applied: applied.length }, applied.length ? "migrations applied" : "schema is up to date");
});
