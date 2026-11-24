import type { CreateOutletRequest, UpdateOutletRequest } from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import { created, type HttpContext, type HttpReply, ok } from "@/platform/http/route.ts";
import type { OutletsService } from "./outlets.service.ts";

type Params = { outletId: string };

/** Translates HTTP into service calls. No business rules live here. */
export class OutletsController {
  constructor(private readonly service: OutletsService) {}

  list = async ({ actor }: HttpContext<unknown, unknown, undefined, Actor>): Promise<HttpReply> =>
    ok(await this.service.list(actor));

  get = async ({ actor, params }: HttpContext<Params, unknown, undefined, Actor>): Promise<HttpReply> =>
    ok(await this.service.get(actor, params.outletId));

  create = async ({ body }: HttpContext<unknown, unknown, CreateOutletRequest, Actor>): Promise<HttpReply> =>
    created(await this.service.create(body));

  update = async ({
    params,
    body,
  }: HttpContext<Params, unknown, UpdateOutletRequest, Actor>): Promise<HttpReply> =>
    ok(await this.service.update(params.outletId, body));
}
