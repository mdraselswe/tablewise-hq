import {
  AssignmentParams,
  CreateMenuItemRequest,
  ListMenuItemsQuery,
  MenuItemParams,
  OutletIdParams,
  UpdateMenuItemRequest,
  UpsertAssignmentRequest,
} from "@tablewise/contracts";
import { route, type RouteDefinition } from "@/platform/http/route.ts";
import type { CatalogController } from "./catalog.controller.ts";

const HQ = ["HQ_ADMIN"] as const;

export function catalogRoutes(controller: CatalogController): RouteDefinition[] {
  return [
    // ---- Master menu ----
    route({
      method: "get",
      path: "/menu-items",
      summary: "List master menu items",
      description: "Search by name or SKU, filter by category and status. Paginated.",
      roles: HQ,
      query: ListMenuItemsQuery,
      handler: controller.listMenuItems,
    }),
    route({
      method: "get",
      path: "/menu-items/categories",
      summary: "List menu categories",
      handler: controller.listCategories,
    }),
    route({
      method: "post",
      path: "/menu-items",
      summary: "Create a master menu item",
      roles: HQ,
      body: CreateMenuItemRequest,
      handler: controller.createMenuItem,
    }),
    route({
      method: "get",
      path: "/menu-items/:menuItemId",
      summary: "Get a master menu item",
      roles: HQ,
      params: MenuItemParams,
      handler: controller.getMenuItem,
    }),
    route({
      method: "patch",
      path: "/menu-items/:menuItemId",
      summary: "Update a master menu item",
      description: "Deactivating an item removes it from every outlet's sellable menu at once.",
      roles: HQ,
      params: MenuItemParams,
      body: UpdateMenuItemRequest,
      handler: controller.updateMenuItem,
    }),
    route({
      method: "get",
      path: "/menu-items/:menuItemId/assignments",
      summary: "Outlets that sell this item",
      roles: HQ,
      params: MenuItemParams,
      handler: controller.listItemAssignments,
    }),

    // ---- Outlet assignments and price overrides ----
    route({
      method: "get",
      path: "/outlets/:outletId/assignments",
      summary: "List an outlet's assigned items",
      description:
        "Includes unavailable items, base price, override and effective price. HQ sees every outlet; outlet staff see their own (read-only).",
      outletParam: "outletId",
      params: OutletIdParams,
      handler: controller.listAssignments,
    }),
    route({
      method: "put",
      path: "/outlets/:outletId/assignments/:menuItemId",
      summary: "Assign an item to an outlet or change its outlet price",
      description:
        "Idempotent upsert. `priceOverrideMinor: null` clears the override. `openingStock` applies on first assignment only. Returns 201 when the item is newly assigned.",
      roles: HQ,
      params: AssignmentParams,
      body: UpsertAssignmentRequest,
      successStatus: 200,
      handler: controller.assign,
    }),
    route({
      method: "delete",
      path: "/outlets/:outletId/assignments/:menuItemId",
      summary: "Remove an item from an outlet",
      roles: HQ,
      params: AssignmentParams,
      successStatus: 204,
      handler: controller.unassign,
    }),

    // ---- Outlet menu ----
    route({
      method: "get",
      path: "/outlets/:outletId/menu",
      summary: "The outlet's sellable menu",
      description:
        "Only items assigned to this outlet, available and active, at the outlet's effective price.",
      outletParam: "outletId",
      params: OutletIdParams,
      handler: controller.outletMenu,
    }),
  ];
}
