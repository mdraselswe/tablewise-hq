import type {
  CreateMenuItemRequest,
  ListMenuItemsQuery,
  UpdateMenuItemRequest,
  UpsertAssignmentRequest,
} from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import { created, type HttpContext, type HttpReply, noContent, ok } from "@/platform/http/route.ts";
import type { CatalogService } from "./catalog.service.ts";

type Ctx<P = unknown, Q = unknown, B = undefined> = HttpContext<P, Q, B, Actor>;
type MenuItemParams = { menuItemId: string };
type OutletParams = { outletId: string };
type AssignmentParams = OutletParams & MenuItemParams;

export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  listMenuItems = async ({ query }: Ctx<unknown, ListMenuItemsQuery>): Promise<HttpReply> =>
    ok(await this.service.listMenuItems(query));

  listCategories = async (_context: Ctx): Promise<HttpReply> => ok(await this.service.listCategories());

  getMenuItem = async ({ params }: Ctx<MenuItemParams>): Promise<HttpReply> =>
    ok(await this.service.getMenuItem(params.menuItemId));

  createMenuItem = async ({ body }: Ctx<unknown, unknown, CreateMenuItemRequest>): Promise<HttpReply> =>
    created(await this.service.createMenuItem(body));

  updateMenuItem = async ({
    params,
    body,
  }: Ctx<MenuItemParams, unknown, UpdateMenuItemRequest>): Promise<HttpReply> =>
    ok(await this.service.updateMenuItem(params.menuItemId, body));

  listItemAssignments = async ({ params }: Ctx<MenuItemParams>): Promise<HttpReply> =>
    ok(await this.service.listAssignmentsForMenuItem(params.menuItemId));

  listAssignments = async ({ params }: Ctx<OutletParams>): Promise<HttpReply> =>
    ok(await this.service.listAssignments(params.outletId));

  assign = async ({
    params,
    body,
    actor,
  }: Ctx<AssignmentParams, unknown, UpsertAssignmentRequest>): Promise<HttpReply> => {
    const { assignment, created: isNew } = await this.service.assign(
      params.outletId,
      params.menuItemId,
      body,
      actor,
    );
    return isNew ? created(assignment) : ok(assignment);
  };

  unassign = async ({ params, actor }: Ctx<AssignmentParams>): Promise<HttpReply> => {
    await this.service.unassign(params.outletId, params.menuItemId, actor);
    return noContent();
  };

  outletMenu = async ({ params }: Ctx<OutletParams>): Promise<HttpReply> =>
    ok(await this.service.outletMenu(params.outletId));
}
