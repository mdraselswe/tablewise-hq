import {
  AdjustStockRequest,
  AssignmentParams,
  ListMovementsQuery,
  OutletIdParams,
  UpdateStockSettingsRequest,
} from "@tablewise/contracts";
import { route, type RouteDefinition } from "@/platform/http/route.ts";
import type { InventoryController } from "./inventory.controller.ts";

export function inventoryRoutes(controller: InventoryController): RouteDefinition[] {
  return [
    route({
      method: "get",
      path: "/outlets/:outletId/inventory",
      summary: "Stock levels of an outlet",
      outletParam: "outletId",
      params: OutletIdParams,
      handler: controller.list,
    }),
    route({
      method: "post",
      path: "/outlets/:outletId/inventory/:menuItemId/adjustments",
      summary: "Restock, correct or write off stock",
      description:
        "Positive delta adds stock, negative removes it. Fails with INSUFFICIENT_STOCK instead of going below zero. Every change is recorded in the audit trail.",
      outletParam: "outletId",
      params: AssignmentParams,
      body: AdjustStockRequest,
      successStatus: 200,
      handler: controller.adjust,
    }),
    route({
      method: "patch",
      path: "/outlets/:outletId/inventory/:menuItemId",
      summary: "Change the low-stock alert threshold",
      outletParam: "outletId",
      params: AssignmentParams,
      body: UpdateStockSettingsRequest,
      handler: controller.updateSettings,
    }),
    route({
      method: "get",
      path: "/outlets/:outletId/inventory/movements",
      summary: "Stock audit trail",
      description:
        "Every stock change with reason, resulting balance, the person who made it and the sale it belongs to.",
      outletParam: "outletId",
      params: OutletIdParams,
      query: ListMovementsQuery,
      handler: controller.movements,
    }),
  ];
}
