import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

// BIGINT (sums, counters) as number: every value we store fits in 2^53 by a wide margin.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));
// DATE stays a plain "YYYY-MM-DD" string; turning it into a JS Date would shift it by the server time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

interface TransactionContext {
  client: pg.PoolClient;
  afterCommit: (() => void)[];
  savepoints: number;
}

export interface DatabaseOptions {
  connectionString: string;
  ssl: boolean;
  max: number;
  applicationName?: string;
  /** Receives errors thrown by after-commit callbacks (the transaction is already committed). */
  onCallbackError?: (error: unknown) => void;
}

const warnCallbackError = (error: unknown): void => {
  process.emitWarning(error instanceof Error ? error : String(error), "AfterCommitCallbackError");
};

/**
 * Thin wrapper around a pg Pool that makes transactions ambient.
 *
 * `transaction(work)` stores the transaction's client in AsyncLocalStorage, and
 * every `query()` made while `work` runs (in any repository, in any module) uses
 * that client automatically. Services therefore compose operations from several
 * repositories, and even several modules, into ONE atomic unit without passing a
 * client through every call. Nested `transaction()` calls join the outer one.
 */
export class Database {
  readonly #storage = new AsyncLocalStorage<TransactionContext>();

  readonly #onCallbackError: (error: unknown) => void;

  constructor(
    readonly pool: pg.Pool,
    onCallbackError: (error: unknown) => void = warnCallbackError,
  ) {
    this.#onCallbackError = onCallbackError;
  }

  static connect(options: DatabaseOptions): Database {
    const pool = new pg.Pool({
      connectionString: options.connectionString,
      max: options.max,
      application_name: options.applicationName ?? "tablewise-api",
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ...(options.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    return new Database(pool, options.onCallbackError);
  }

  get inTransaction(): boolean {
    return this.#storage.getStore() !== undefined;
  }

  async query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<pg.QueryResult<Row>> {
    const context = this.#storage.getStore();
    const executor = context ? context.client : this.pool;
    return executor.query<Row>(text, params as unknown[]);
  }

  async many<Row extends pg.QueryResultRow>(text: string, params: readonly unknown[] = []): Promise<Row[]> {
    return (await this.query<Row>(text, params)).rows;
  }

  async one<Row extends pg.QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<Row | undefined> {
    return (await this.query<Row>(text, params)).rows[0];
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.#storage.getStore()) return work();

    const client = await this.pool.connect();
    const context: TransactionContext = { client, afterCommit: [], savepoints: 0 };
    let result: T;
    try {
      await client.query("BEGIN");
      result = await this.#storage.run(context, work);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    // Outside the try: the work is committed, so a failing callback must not turn
    // the result into an error (a caller would report a saved sale as failed).
    for (const callback of context.afterCommit) this.#runCallback(callback);
    return result;
  }

  /**
   * Runs `work` inside a SAVEPOINT of the current transaction. If it throws, only
   * its own changes are undone and the outer transaction continues.
   */
  async savepoint<T>(work: () => Promise<T>): Promise<T> {
    const context = this.#storage.getStore();
    if (!context) throw new Error("savepoint() requires an active transaction");
    context.savepoints += 1;
    const name = `sp_${context.savepoints}`;
    await context.client.query(`SAVEPOINT ${name}`);
    try {
      const result = await work();
      await context.client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await context.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      throw error;
    }
  }

  /** Runs `callback` after the current transaction commits (immediately when there is none). */
  afterCommit(callback: () => void): void {
    const context = this.#storage.getStore();
    if (context) context.afterCommit.push(callback);
    else this.#runCallback(callback);
  }

  #runCallback(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.#onCallbackError(error);
    }
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** PostgreSQL error codes we translate into API errors. */
export const PgErrorCode = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  NOT_NULL_VIOLATION: "23502",
  INVALID_TEXT_REPRESENTATION: "22P02",
  DEADLOCK_DETECTED: "40P01",
  SERIALIZATION_FAILURE: "40001",
} as const;

export function isPgError(error: unknown): error is pg.DatabaseError {
  return error instanceof pg.DatabaseError;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return (
    isPgError(error) &&
    error.code === PgErrorCode.UNIQUE_VIOLATION &&
    (constraint === undefined || error.constraint === constraint)
  );
}
