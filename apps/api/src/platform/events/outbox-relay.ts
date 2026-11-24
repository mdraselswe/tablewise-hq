import type { AnyIntegrationEvent } from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";
import type { Logger } from "@/platform/logger.ts";
import type { EventBus } from "./event-bus.ts";

interface OutboxRow {
  id: string;
  event_type: string;
  payload: unknown;
  occurred_at: Date;
  attempts: number;
}

export interface OutboxRelayOptions {
  pollIntervalMs: number;
  batchSize?: number;
  /** After this many failures an event is parked (dead-lettered) for a human to inspect. */
  maxAttempts?: number;
}

/**
 * Moves events from the outbox table to their consumers.
 *
 * - Wakes immediately when a transaction that published events commits, and also
 *   polls as a safety net (events written by another instance, retries).
 * - `FOR UPDATE SKIP LOCKED` lets any number of API instances run a relay without
 *   handing the same event to two of them.
 * - Each consumer of an event runs in its own SAVEPOINT (see EventBus). If any of
 *   them fails, the event is retried later with exponential backoff for those
 *   consumers only, and never blocks the rest of the batch.
 * - After `maxAttempts` the event is parked: logged as an error, counted by
 *   `/health/ready`, and re-queued by `replayParked()` (`db:replay-events`) once
 *   the cause is fixed.
 */
export class OutboxRelay {
  readonly #batchSize: number;
  readonly #maxAttempts: number;
  #timer: NodeJS.Timeout | undefined;
  #running: Promise<void> | undefined;
  #again = false;
  #stopped = true;

  constructor(
    private readonly db: Database,
    private readonly bus: EventBus,
    private readonly logger: Logger,
    private readonly options: OutboxRelayOptions,
  ) {
    this.#batchSize = options.batchSize ?? 100;
    this.#maxAttempts = options.maxAttempts ?? 10;
  }

  start(): void {
    this.#stopped = false;
    this.kick();
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    clearTimeout(this.#timer);
    await this.#running;
  }

  /** Requests a run now. Coalesces bursts: at most one run in flight plus one queued. */
  kick(): void {
    if (this.#stopped) return;
    if (this.#running) {
      this.#again = true;
      return;
    }
    clearTimeout(this.#timer);
    this.#running = this.#runUntilIdle().finally(() => {
      this.#running = undefined;
      if (this.#again) {
        this.#again = false;
        this.kick();
      } else if (!this.#stopped) {
        this.#timer = setTimeout(() => this.kick(), this.options.pollIntervalMs);
        this.#timer.unref();
      }
    });
  }

  /** Processes every pending event, then resolves. Used by tests and the seeder. */
  async drain(): Promise<void> {
    await this.#running;
    await this.#runUntilIdle();
  }

  async #runUntilIdle(): Promise<void> {
    try {
      while ((await this.#processBatch()) > 0) {
        // keep going while there is work
      }
    } catch (error) {
      this.logger.error({ err: error }, "outbox relay batch failed");
    }
  }

  async #processBatch(): Promise<number> {
    return this.db.transaction(async () => {
      const rows = await this.db.many<OutboxRow>(
        `SELECT id, event_type, payload, occurred_at, attempts
           FROM platform.outbox_events
          WHERE published_at IS NULL AND available_at <= now() AND attempts < $2
          ORDER BY occurred_at, id
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        [this.#batchSize, this.#maxAttempts],
      );

      let delivered = 0;
      for (const row of rows) {
        const event = {
          id: row.id,
          type: row.event_type,
          occurredAt: row.occurred_at.toISOString(),
          payload: row.payload,
        } as AnyIntegrationEvent;
        const failures = await this.bus.dispatch(event);
        if (failures.length === 0) {
          await this.db.query(
            `UPDATE platform.outbox_events
                SET published_at = now(), attempts = attempts + 1, last_error = NULL
              WHERE id = $1`,
            [row.id],
          );
          delivered += 1;
          continue;
        }

        const attempts = row.attempts + 1;
        const backoffSeconds = Math.min(2 ** attempts, 300);
        const lastError = failures
          .map(
            ({ consumer, error }) => `${consumer}: ${error instanceof Error ? error.message : String(error)}`,
          )
          .join("; ");
        await this.db.query(
          `UPDATE platform.outbox_events
              SET attempts = $2, last_error = $3, available_at = now() + make_interval(secs => $4)
            WHERE id = $1`,
          [row.id, attempts, lastError.slice(0, 1000), backoffSeconds],
        );
        const parked = attempts >= this.#maxAttempts;
        this.logger[parked ? "error" : "warn"](
          {
            err: failures[0]?.error,
            eventId: row.id,
            type: row.event_type,
            consumers: failures.map((failure) => failure.consumer),
            attempts,
          },
          parked ? "event parked after repeated delivery failures" : "event delivery failed",
        );
      }
      // Count delivered events only: a batch of failures must not spin the loop.
      return delivered;
    });
  }

  /** Events that exhausted their attempts and wait for a human. */
  async parkedCount(): Promise<number> {
    const row = await this.db.one<{ count: number }>(
      `SELECT count(*)::int AS count FROM platform.outbox_events
        WHERE published_at IS NULL AND attempts >= $1`,
      [this.#maxAttempts],
    );
    return row?.count ?? 0;
  }

  /**
   * Re-queues parked events (all of them, or only `eventIds`) with a fresh attempt
   * budget. Safe to run at any time: consumers that already succeeded are skipped
   * by the inbox. `last_error` is kept until a delivery succeeds.
   */
  async replayParked(eventIds?: readonly string[]): Promise<number> {
    const result = await this.db.query(
      `UPDATE platform.outbox_events
          SET attempts = 0, available_at = now()
        WHERE published_at IS NULL AND attempts >= $1
          AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
      [this.#maxAttempts, eventIds ?? null],
    );
    this.kick();
    return result.rowCount ?? 0;
  }
}
