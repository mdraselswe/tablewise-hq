import type { ListTicketsQuery, UpdateTicketStatusRequest } from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import { type HttpContext, type HttpReply, ok } from "@/platform/http/route.ts";
import type { KitchenService } from "./kitchen.service.ts";

type Ctx<P = unknown, Q = unknown, B = undefined> = HttpContext<P, Q, B, Actor>;

export class KitchenController {
  constructor(private readonly service: KitchenService) {}

  list = async ({ params, query }: Ctx<{ outletId: string }, ListTicketsQuery>): Promise<HttpReply> =>
    ok(await this.service.listTickets(params.outletId, query.scope));

  updateStatus = async ({
    params,
    body,
    actor,
  }: Ctx<{ ticketId: string }, unknown, UpdateTicketStatusRequest>): Promise<HttpReply> =>
    ok(await this.service.updateStatus(actor, params.ticketId, body.status));
}
