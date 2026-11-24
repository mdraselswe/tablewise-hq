import { randomUUID } from "node:crypto";
import type { EventPayloads, EventType, IntegrationEvent } from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";

export interface Aggregate {
  type: string;
  id: string;
}

/**
 * Transactional outbox writer.
 *
 * `publish` must run inside the transaction that changes state. The event row
 * commits or rolls back together with that change, which removes the classic
 * dual-write bug ("saved the sale, crashed before publishing the event").
 */
export class Outbox {
  readonly #committedListeners: (() => void)[] = [];

  constructor(private readonly db: Database) {}

  /** Called after a transaction that published events commits (the relay uses it to start at once). */
  onCommitted(listener: () => void): void {
    this.#committedListeners.push(listener);
  }

  async publish<T extends EventType>(
    type: T,
    aggregate: Aggregate,
    payload: EventPayloads[T],
  ): Promise<IntegrationEvent<T>> {
    if (!this.db.inTransaction) {
      throw new Error(`Outbox.publish(${type}) must run inside a transaction`);
    }
    const event: IntegrationEvent<T> = {
      id: randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      payload,
    };
    await this.db.query(
      `INSERT INTO platform.outbox_events (id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.id, aggregate.type, aggregate.id, type, JSON.stringify(payload), event.occurredAt],
    );
    this.db.afterCommit(() => {
      for (const listener of this.#committedListeners) listener();
    });
    return event;
  }
}
