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
 * - Each event is dispatched inside a SAVEPOINT: a failing event is rolled back,
 *   retried later with exponential backoff, and never blocks the rest of the batch.
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
        try {
          await this.db.savepoint(() => this.bus.dispatch(event));
          await this.db.query(
            `UPDATE platform.outbox_events
                SET published_at = now(), attempts = attempts + 1, last_error = NULL
              WHERE id = $1`,
            [row.id],
          );
          delivered += 1;
        } catch (error) {
          const attempts = row.attempts + 1;
          const backoffSeconds = Math.min(2 ** attempts, 300);
          await this.db.query(
            `UPDATE platform.outbox_events
                SET attempts = $2, last_error = $3, available_at = now() + make_interval(secs => $4)
              WHERE id = $1`,
            [row.id, attempts, String((error as Error).message).slice(0, 1000), backoffSeconds],
          );
          const level = attempts >= this.#maxAttempts ? "error" : "warn";
          this.logger[level](
            { err: error, eventId: row.id, type: row.event_type, attempts },
            "event delivery failed",
          );
        }
      }
      // Count delivered events only: a batch of failures must not spin the loop.
      return delivered;
    });
  }
}
