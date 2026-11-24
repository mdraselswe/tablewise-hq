import { dropAllSchemas, migrate } from "@/platform/db/migrator.ts";
import { seedDemoData } from "@/seed/demo-data.ts";
import { runCommand } from "./run.ts";

await runCommand("reset", async (container) => {
  if (container.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("Refusing to wipe a production database. Pass --force if you really mean it.");
  }
  await dropAllSchemas(container.db);
  await migrate(container.db, container.env.MIGRATIONS_DIR, container.logger);
  await seedDemoData(container);
});
