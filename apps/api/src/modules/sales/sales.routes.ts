import { z } from "zod";
import {
  CreateSaleRequest,
  IdempotencyKey,
  ListSalesQuery,
  OutletIdParams,
  SaleParams,
} from "@tablewise/contracts";
import { route, type RouteDefinition } from "@/platform/http/route.ts";
import type { SalesController } from "./sales.controller.ts";

const SaleHeaders = z.object({ "idempotency-key": IdempotencyKey });

export function salesRoutes(controller: SalesController): RouteDefinition[] {
  return [
    route({
      method: "post",
      path: "/outlets/:outletId/sales",
      summary: "Record a sale",
      description: [
        "Atomic: validates items against the outlet menu, deducts stock (never below zero),",
        "assigns the next gap-free receipt number for the outlet and stores the sale, all in one transaction.",
        "Send an `Idempotency-Key` (UUID) header so retries and offline re-syncs never create duplicates;",
        "a replay returns the original sale with status 200 and `Idempotent-Replayed: true`.",
        "Reusing a key for a different request (lines, payment method or `occurredAt`) fails with 422 `IDEMPOTENCY_KEY_REUSED`.",
      ].join(" "),
      roles: ["OUTLET_STAFF"],
      outletParam: "outletId",
      params: OutletIdParams,
      headers: SaleHeaders,
      body: CreateSaleRequest,
      handler: controller.create,
    }),
    route({
      method: "get",
      path: "/sales",
      summary: "List sales",
      description: "Newest first. HQ may filter by outlet; outlet staff always see their own outlet.",
      query: ListSalesQuery,
      handler: controller.list,
    }),
    route({
      method: "get",
      path: "/sales/:saleId",
      summary: "Get a sale with its lines (receipt)",
      params: SaleParams,
      handler: controller.get,
    }),
  ];
}
