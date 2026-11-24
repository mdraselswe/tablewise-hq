import type { Database } from "@/platform/db/database.ts";
import type { EventBus } from "@/platform/events/event-bus.ts";
import type { Outbox } from "@/platform/events/outbox.ts";
import type { ModuleDefinition } from "@/platform/module.ts";
import { KitchenController } from "./kitchen.controller.ts";
import { KitchenRepository } from "./kitchen.repository.ts";
import { kitchenRoutes } from "./kitchen.routes.ts";
import { KitchenService } from "./kitchen.service.ts";

/**
 * Kitchen depends on no other module's code. It learns about sales only from the
 * `sales.sale.completed` event, which is why it could run on a separate machine
 * (or, in a store, on the local edge server) without any change here.
 */
export function createKitchenModule(deps: { db: Database; outbox: Outbox; bus: EventBus }): {
  module: ModuleDefinition;
} {
  const service = new KitchenService(deps.db, new KitchenRepository(deps.db), deps.outbox);
  deps.bus.subscribe("sales.sale.completed", "kitchen.tickets", (event) => service.onSaleCompleted(event));
  return {
    module: {
      name: "Kitchen",
      description:
        "Kitchen Display System: tickets created from sale events, bumped through preparation states.",
      routes: kitchenRoutes(new KitchenController(service)),
    },
  };
}
