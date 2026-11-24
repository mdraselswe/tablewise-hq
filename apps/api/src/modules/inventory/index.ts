import type { Database } from "@/platform/db/database.ts";
import type { Outbox } from "@/platform/events/outbox.ts";
import type { ModuleDefinition } from "@/platform/module.ts";
import { InventoryController } from "./inventory.controller.ts";
import { InventoryRepository } from "./inventory.repository.ts";
import { inventoryRoutes } from "./inventory.routes.ts";
import { InventoryService } from "./inventory.service.ts";

export type { SaleDeduction } from "./inventory.service.ts";
export type InventoryApi = Pick<InventoryService, "initializeStock" | "deductForSale" | "adjust">;

export function createInventoryModule(deps: { db: Database; outbox: Outbox }): {
  module: ModuleDefinition;
  api: InventoryApi;
} {
  const service = new InventoryService(deps.db, new InventoryRepository(deps.db), deps.outbox);
  return {
    module: {
      name: "Inventory",
      description: "Stock per outlet and menu item. Stock never goes negative; every change is audited.",
      routes: inventoryRoutes(new InventoryController(service)),
    },
    api: service,
  };
}
