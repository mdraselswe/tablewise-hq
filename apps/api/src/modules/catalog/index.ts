import type { Database } from "@/platform/db/database.ts";
import type { ModuleDefinition } from "@/platform/module.ts";
import { CatalogController } from "./catalog.controller.ts";
import { CatalogRepository } from "./catalog.repository.ts";
import { catalogRoutes } from "./catalog.routes.ts";
import { type CatalogInventoryPort, type CatalogOutletsPort, CatalogService } from "./catalog.service.ts";

export type { SellableItem } from "./catalog.repository.ts";
export type CatalogApi = Pick<CatalogService, "sellableItems" | "createMenuItem" | "assign">;

export function createCatalogModule(deps: {
  db: Database;
  outlets: CatalogOutletsPort;
  inventory: CatalogInventoryPort;
}): { module: ModuleDefinition; api: CatalogApi } {
  const service = new CatalogService(deps.db, new CatalogRepository(deps.db), deps.outlets, deps.inventory);
  return {
    module: {
      name: "Catalog",
      description: "The HQ master menu, which outlet sells which item, and outlet-specific prices.",
      routes: catalogRoutes(new CatalogController(service)),
    },
    api: service,
  };
}
