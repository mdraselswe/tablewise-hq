import { Database } from "@/platform/db/database.ts";
import { dropAllSchemas, migrate } from "@/platform/db/migrator.ts";
import { createLogger } from "@/platform/logger.ts";
import { TEST_DATABASE_URL } from "./helpers.ts";

/** Rebuilds the test database schema once per run, from the real migrations. */
export default async function setup(): Promise<void> {
  const db = Database.connect({ connectionString: TEST_DATABASE_URL, ssl: false, max: 2 });
  try {
    await dropAllSchemas(db);
    await migrate(db, "migrations", createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" }));
  } finally {
    await db.close();
  }
}
