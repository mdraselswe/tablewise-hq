import { migrate } from "@/platform/db/migrator.ts";
import { seedDemoData } from "@/seed/demo-data.ts";
import { runCommand } from "./run.ts";

await runCommand("seed", async (container) => {
  await migrate(container.db, container.env.MIGRATIONS_DIR, container.logger);
  await seedDemoData(container);
});
