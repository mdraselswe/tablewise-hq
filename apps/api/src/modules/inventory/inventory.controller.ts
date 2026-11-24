import type {
  AdjustStockRequest,
  ListMovementsQuery,
  UpdateStockSettingsRequest,
} from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import { type HttpContext, type HttpReply, ok } from "@/platform/http/route.ts";
import type { InventoryService } from "./inventory.service.ts";

type Ctx<P = unknown, Q = unknown, B = undefined> = HttpContext<P, Q, B, Actor>;
type OutletParams = { outletId: string };
type ItemParams = OutletParams & { menuItemId: string };

export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  list = async ({ params }: Ctx<OutletParams>): Promise<HttpReply> =>
    ok(await this.service.listStock(params.outletId));

  adjust = async ({
    params,
    body,
    actor,
  }: Ctx<ItemParams, unknown, AdjustStockRequest>): Promise<HttpReply> =>
    ok(await this.service.adjust(params.outletId, params.menuItemId, body, actor));

  updateSettings = async ({
    params,
    body,
  }: Ctx<ItemParams, unknown, UpdateStockSettingsRequest>): Promise<HttpReply> =>
    ok(await this.service.updateThreshold(params.outletId, params.menuItemId, body.lowStockThreshold));

  movements = async ({ params, query }: Ctx<OutletParams, ListMovementsQuery>): Promise<HttpReply> =>
    ok(await this.service.listMovements(params.outletId, query));
}
