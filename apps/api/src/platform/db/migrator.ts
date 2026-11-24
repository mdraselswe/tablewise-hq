import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "@/platform/logger.ts";
import type { Database } from "./database.ts";

const LOCK_KEY = 7_340_021; // Arbitrary constant: one migrator at a time across all instances.
const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

interface AppliedMigration {
  version: string;
  checksum: string;
}

/**
 * Plain-SQL, forward-only migrations.
 *
 * - Files are `NNNN_name.sql`, applied in order, each in its own transaction.
 * - A checksum guards against editing a migration after it ran (add a new one instead).
 * - An advisory lock lets several app instances boot at once safely.
 */
export async function migrate(db: Database, directory: string, logger: Logger): Promise<string[]> {
  const files = (await readdir(directory)).filter((file) => FILE_PATTERN.test(file)).sort();
  const client = await db.pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query("CREATE SCHEMA IF NOT EXISTS platform");
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        version    varchar(4)   PRIMARY KEY,
        name       varchar(200) NOT NULL,
        checksum   char(64)     NOT NULL,
        applied_at timestamptz  NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<AppliedMigration>(
      "SELECT version, checksum FROM platform.schema_migrations",
    );
    const done = new Map(rows.map((row) => [row.version, row.checksum]));

    for (const file of files) {
      const version = file.slice(0, 4);
      const sql = await readFile(path.join(directory, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = done.get(version);
      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(`Migration ${file} changed after it was applied. Add a new migration instead.`);
        }
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO platform.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [version, file, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
      }
      applied.push(file);
      logger.info({ migration: file }, "migration applied");
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

/** Drops every module schema. Development and test only. */
export async function dropAllSchemas(db: Database): Promise<void> {
  await db.query(`
    DROP SCHEMA IF EXISTS reporting, kitchen, sales, inventory, catalog, identity, outlets, platform CASCADE
  `);
}
