import {
  ListTicketsQuery,
  OutletIdParams,
  TicketParams,
  UpdateTicketStatusRequest,
} from "@tablewise/contracts";
import { route, type RouteDefinition } from "@/platform/http/route.ts";
import type { KitchenController } from "./kitchen.controller.ts";

export function kitchenRoutes(controller: KitchenController): RouteDefinition[] {
  return [
    route({
      method: "get",
      path: "/outlets/:outletId/kitchen/tickets",
      summary: "Kitchen board tickets",
      description:
        "`scope=active` (default) returns open tickets oldest first; `all` adds served tickets from the last 24 hours.",
      outletParam: "outletId",
      params: OutletIdParams,
      query: ListTicketsQuery,
      handler: controller.list,
    }),
    route({
      method: "patch",
      path: "/kitchen/tickets/:ticketId",
      summary: "Bump or recall a ticket",
      description: "NEW -> PREPARING -> READY -> SERVED, with one step back allowed before serving.",
      params: TicketParams,
      body: UpdateTicketStatusRequest,
      handler: controller.updateStatus,
    }),
  ];
}
