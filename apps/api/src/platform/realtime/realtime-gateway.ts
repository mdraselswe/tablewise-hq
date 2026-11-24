import type { Request, Response } from "express";
import pg from "pg";
import { type AnyIntegrationEvent, REALTIME_EVENT_TYPES } from "@tablewise/contracts";
import { type Actor, canAccessOutlet } from "@/platform/auth/actor.ts";
import { type Database, sslOption } from "@/platform/db/database.ts";
import type { EventBus } from "@/platform/events/event-bus.ts";
import { UnauthenticatedError } from "@/platform/http/errors.ts";
import type { Logger } from "@/platform/logger.ts";

const CHANNEL = "tablewise_realtime";
const HEARTBEAT_MS = 25_000;
/** PostgreSQL rejects NOTIFY payloads of 8000 bytes or more. */
const MAX_NOTIFY_BYTES = 7_500;

interface Client {
  actor: Actor;
  res: Response;
}

/**
 * Pushes integration events to browsers over Server-Sent Events.
 *
 * Fan-out works across many API instances without Redis: the instance whose relay
 * delivers an event runs `pg_notify`, and every instance LISTENs on the channel and
 * forwards the event to its own connected browsers. Each browser only receives
 * events for outlets it may see (HQ sees all).
 */
export class RealtimeGateway {
  readonly #clients = new Set<Client>();
  #listener: pg.Client | undefined;
  #heartbeat: NodeJS.Timeout | undefined;
  #stopped = true;

  constructor(
    private readonly db: Database,
    private readonly connection: { connectionString: string; ssl: boolean },
    private readonly logger: Logger,
  ) {}

  /** Subscribes to the realtime events so they are forwarded to NOTIFY. */
  register(bus: EventBus): void {
    for (const type of REALTIME_EVENT_TYPES) {
      bus.subscribe(type, "realtime.notify", async (event) => {
        let message = JSON.stringify(event);
        if (Buffer.byteLength(message) > MAX_NOTIFY_BYTES && event.type === "sales.sale.completed") {
          // Very large sales: browsers only need the totals, and refetch details on demand.
          message = JSON.stringify({ ...event, payload: { ...event.payload, lines: [] } });
        }
        await this.db.query("SELECT pg_notify($1, $2)", [CHANNEL, message]);
      });
    }
  }

  async start(): Promise<void> {
    this.#stopped = false;
    await this.#listen();
    this.#heartbeat = setInterval(() => {
      for (const client of this.#clients) client.res.write(": heartbeat\n\n");
    }, HEARTBEAT_MS);
    this.#heartbeat.unref();
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    clearInterval(this.#heartbeat);
    for (const client of this.#clients) client.res.end();
    this.#clients.clear();
    await this.#listener?.end().catch(() => undefined);
  }

  get connectedClients(): number {
    return this.#clients.size;
  }

  /** GET /api/v1/stream */
  readonly stream = (req: Request, res: Response): void => {
    const actor = req.actor;
    if (!actor) throw new UnauthenticatedError();

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tell proxies (Nginx, Render) not to buffer the stream.
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    res.write(`event: ready\ndata: ${JSON.stringify({ role: actor.role, outletId: actor.outletId })}\n\n`);

    const client: Client = { actor, res };
    this.#clients.add(client);
    req.on("close", () => this.#clients.delete(client));
  };

  async #listen(): Promise<void> {
    const listener = new pg.Client({
      connectionString: this.connection.connectionString,
      application_name: "tablewise-realtime",
      ...sslOption(this.connection.ssl),
    });
    listener.on("notification", (message) => {
      if (message.channel !== CHANNEL || !message.payload) return;
      try {
        this.#fanOut(JSON.parse(message.payload) as AnyIntegrationEvent);
      } catch (error) {
        this.logger.warn({ err: error }, "dropped malformed realtime notification");
      }
    });
    listener.on("error", (error) => {
      this.logger.warn({ err: error }, "realtime listener lost its connection; reconnecting");
      void listener.end().catch(() => undefined);
      this.#reconnect();
    });
    await listener.connect();
    await listener.query(`LISTEN ${CHANNEL}`);
    this.#listener = listener;
  }

  #reconnect(attempt = 1): void {
    if (this.#stopped) return;
    const delay = Math.min(1000 * 2 ** attempt, 30_000);
    setTimeout(() => {
      this.#listen().catch((error: unknown) => {
        this.logger.warn({ err: error, attempt }, "realtime reconnect failed");
        this.#reconnect(attempt + 1);
      });
    }, delay).unref();
  }

  #fanOut(event: AnyIntegrationEvent): void {
    const frame = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.#clients) {
      if (canAccessOutlet(client.actor, event.payload.outletId)) client.res.write(frame);
    }
  }
}
