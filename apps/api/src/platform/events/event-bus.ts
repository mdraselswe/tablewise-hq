import type { AnyIntegrationEvent, EventType, IntegrationEvent } from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";

type Handler<T extends EventType> = (event: IntegrationEvent<T>) => Promise<void>;

interface Subscription {
  consumer: string;
  handle: (event: AnyIntegrationEvent) => Promise<void>;
}

export interface DeliveryFailure {
  consumer: string;
  error: unknown;
}

/**
 * In-process publish/subscribe for integration events.
 *
 * Only the outbox relay calls `dispatch`, so handlers run after the producing
 * transaction committed, never inside it. Each (consumer, event) pair is recorded
 * in `platform.inbox` in the same transaction as the handler's own writes, so a
 * redelivered event is skipped: handlers are idempotent by construction.
 *
 * Every consumer runs in its own SAVEPOINT. A failing consumer rolls back only its
 * own work; the others keep theirs (and their inbox rows), so a broken kitchen
 * handler can never hold back the revenue projection. The event is retried for the
 * failed consumers only, because the inbox skips the ones that already succeeded.
 *
 * Moving to a broker (RabbitMQ, Kafka, SNS/SQS) replaces this class and the
 * relay's transport; producers and handlers stay unchanged.
 */
export class EventBus {
  readonly #subscriptions = new Map<EventType, Subscription[]>();

  constructor(private readonly db: Database) {}

  subscribe<T extends EventType>(type: T, consumer: string, handle: Handler<T>): void {
    const list = this.#subscriptions.get(type) ?? [];
    if (list.some((subscription) => subscription.consumer === consumer)) {
      throw new Error(`Consumer "${consumer}" already subscribes to ${type}`);
    }
    list.push({ consumer, handle: handle as unknown as Subscription["handle"] });
    this.#subscriptions.set(type, list);
  }

  consumersOf(type: EventType): string[] {
    return (this.#subscriptions.get(type) ?? []).map((subscription) => subscription.consumer);
  }

  /** Delivers `event` to every consumer and returns the ones that failed (empty when all succeeded). */
  async dispatch(event: AnyIntegrationEvent): Promise<DeliveryFailure[]> {
    return this.db.transaction(async () => {
      const failures: DeliveryFailure[] = [];
      for (const subscription of this.#subscriptions.get(event.type) ?? []) {
        try {
          await this.db.savepoint(async () => {
            const claimed = await this.db.query(
              `INSERT INTO platform.inbox (consumer, event_id) VALUES ($1, $2)
               ON CONFLICT (consumer, event_id) DO NOTHING`,
              [subscription.consumer, event.id],
            );
            if (claimed.rowCount === 0) return;
            await subscription.handle(event);
          });
        } catch (error) {
          failures.push({ consumer: subscription.consumer, error });
        }
      }
      return failures;
    });
  }
}
