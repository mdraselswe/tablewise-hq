import { CreateOutletRequest, OutletIdParams, UpdateOutletRequest } from "@tablewise/contracts";
import { route, type RouteDefinition } from "@/platform/http/route.ts";
import type { OutletsController } from "./outlets.controller.ts";

export function outletsRoutes(controller: OutletsController): RouteDefinition[] {
  return [
    route({
      method: "get",
      path: "/outlets",
      summary: "List outlets",
      description: "HQ sees every outlet. Outlet staff see only their own.",
      handler: controller.list,
    }),
    route({
      method: "post",
      path: "/outlets",
      summary: "Create an outlet",
      roles: ["HQ_ADMIN"],
      body: CreateOutletRequest,
      handler: controller.create,
    }),
    route({
      method: "get",
      path: "/outlets/:outletId",
      summary: "Get an outlet",
      outletParam: "outletId",
      params: OutletIdParams,
      handler: controller.get,
    }),
    route({
      method: "patch",
      path: "/outlets/:outletId",
      summary: "Update an outlet",
      description:
        "Rename, move or deactivate an outlet. The code is immutable because it prefixes receipts.",
      roles: ["HQ_ADMIN"],
      params: OutletIdParams,
      body: UpdateOutletRequest,
      handler: controller.update,
    }),
  ];
}
