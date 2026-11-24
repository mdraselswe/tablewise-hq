import type { Database } from "@/platform/db/database.ts";
import type { Outbox } from "@/platform/events/outbox.ts";
import type { ModuleDefinition } from "@/platform/module.ts";
import { OutletsController } from "./outlets.controller.ts";
import { OutletsRepository } from "./outlets.repository.ts";
import { outletsRoutes } from "./outlets.routes.ts";
import { OutletsService } from "./outlets.service.ts";

/** What other modules may call. Replace with an HTTP client to run Outlets as its own service. */
export type OutletsApi = Pick<OutletsService, "require" | "requireActive" | "create">;

export function createOutletsModule(deps: { db: Database; outbox: Outbox }): {
  module: ModuleDefinition;
  api: OutletsApi;
} {
  const service = new OutletsService(deps.db, new OutletsRepository(deps.db), deps.outbox);
  return {
    module: {
      name: "Outlets",
      description: "Company branches. Every outlet has an immutable code used as its receipt prefix.",
      routes: outletsRoutes(new OutletsController(service)),
    },
    api: service,
  };
}
