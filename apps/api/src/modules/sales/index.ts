import type { Database } from "@/platform/db/database.ts";
import type { Outbox } from "@/platform/events/outbox.ts";
import type { ModuleDefinition } from "@/platform/module.ts";
import { SalesController } from "./sales.controller.ts";
import { SalesRepository } from "./sales.repository.ts";
import { salesRoutes } from "./sales.routes.ts";
import {
  type SalesCatalogPort,
  type SalesInventoryPort,
  type SalesOutletsPort,
  SalesService,
} from "./sales.service.ts";

export type { CreateSaleCommand } from "./sales.service.ts";
export type SalesApi = Pick<SalesService, "createSale">;

export function createSalesModule(deps: {
  db: Database;
  outbox: Outbox;
  outlets: SalesOutletsPort;
  catalog: SalesCatalogPort;
  inventory: SalesInventoryPort;
}): { module: ModuleDefinition; api: SalesApi } {
  const service = new SalesService(deps.db, new SalesRepository(deps.db), deps.outbox, {
    outlets: deps.outlets,
    catalog: deps.catalog,
    inventory: deps.inventory,
  });
  return {
    module: {
      name: "Sales",
      description:
        "Point-of-sale transactions with atomic stock deduction and gap-free receipt numbers per outlet.",
      routes: salesRoutes(new SalesController(service)),
    },
    api: service,
  };
}
