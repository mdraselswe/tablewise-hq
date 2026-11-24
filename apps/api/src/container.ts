import type { Env } from "@/config/env.ts";
import { createCatalogModule } from "@/modules/catalog";
import { createIdentityModule } from "@/modules/identity";
import { createInventoryModule } from "@/modules/inventory";
import { createKitchenModule } from "@/modules/kitchen";
import { createOutletsModule } from "@/modules/outlets";
import { createSalesModule } from "@/modules/sales";
import { TokenService } from "@/platform/auth/token-service.ts";
import { Database } from "@/platform/db/database.ts";
import { EventBus } from "@/platform/events/event-bus.ts";
import { Outbox } from "@/platform/events/outbox.ts";
import { OutboxRelay } from "@/platform/events/outbox-relay.ts";
import type { Logger } from "@/platform/logger.ts";
import type { ModuleDefinition } from "@/platform/module.ts";
import { RealtimeGateway } from "@/platform/realtime/realtime-gateway.ts";

/**
 * Composition root: the ONLY file that knows every module.
 *
 * Modules are built in dependency order and handed each other's public `api`
 * through the ports they declare. To extract a module into its own service,
 * replace its `api` here with a client that speaks HTTP/gRPC to that service;
 * no caller changes.
 */
export function createContainer(env: Env, logger: Logger) {
  const db = Database.connect({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL,
    max: env.DATABASE_POOL_MAX,
  });
  const tokens = new TokenService(env.JWT_SECRET, env.SESSION_TTL_MINUTES);
  const bus = new EventBus(db);
  const outbox = new Outbox(db);
  const relay = new OutboxRelay(db, bus, logger, { pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS });
  outbox.onCommitted(() => relay.kick());

  const realtime = new RealtimeGateway(
    db,
    { connectionString: env.DATABASE_URL, ssl: env.DATABASE_SSL },
    logger,
  );
  realtime.register(bus);

  const identity = createIdentityModule({
    db,
    tokens,
    secureCookies: env.COOKIE_SECURE ?? env.NODE_ENV === "production",
    rateLimitLogin: env.NODE_ENV !== "test",
  });
  const outlets = createOutletsModule({ db, outbox });
  const inventory = createInventoryModule({ db, outbox });
  const catalog = createCatalogModule({ db, outlets: outlets.api, inventory: inventory.api });
  const sales = createSalesModule({
    db,
    outbox,
    outlets: outlets.api,
    catalog: catalog.api,
    inventory: inventory.api,
  });
  const kitchen = createKitchenModule({ db, outbox, bus });

  const modules: ModuleDefinition[] = [
    identity.module,
    outlets.module,
    catalog.module,
    inventory.module,
    sales.module,
    kitchen.module,
  ];

  return {
    env,
    logger,
    db,
    tokens,
    bus,
    relay,
    realtime,
    modules,
    api: {
      identity: identity.api,
      outlets: outlets.api,
      catalog: catalog.api,
      inventory: inventory.api,
      sales: sales.api,
    },
    async close(): Promise<void> {
      await relay.stop();
      await realtime.stop();
      await db.close();
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
