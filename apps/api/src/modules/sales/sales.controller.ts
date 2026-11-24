import { type CreateSaleRequest, IDEMPOTENCY_KEY_HEADER, type ListSalesQuery } from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import { created, type HttpContext, type HttpReply, ok } from "@/platform/http/route.ts";
import type { SalesService } from "./sales.service.ts";

type Ctx<P = unknown, Q = unknown, B = undefined> = HttpContext<P, Q, B, Actor>;

export class SalesController {
  constructor(private readonly service: SalesService) {}

  create = async ({
    params,
    body,
    actor,
    req,
  }: Ctx<{ outletId: string }, unknown, CreateSaleRequest>): Promise<HttpReply> => {
    const { sale, replayed } = await this.service.createSale({
      outletId: params.outletId,
      request: body,
      // Already validated as a UUID; lowercased so the advisory lock and lookup see one spelling.
      idempotencyKey: req.header(IDEMPOTENCY_KEY_HEADER)?.toLowerCase(),
      actor,
    });
    // A replay returns the original sale with 200, so clients can retry blindly.
    return replayed ? ok(sale, { "Idempotent-Replayed": "true" }) : created(sale);
  };

  list = async ({ query, actor }: Ctx<unknown, ListSalesQuery>): Promise<HttpReply> =>
    ok(await this.service.listSales(actor, query));

  get = async ({ params, actor }: Ctx<{ saleId: string }>): Promise<HttpReply> =>
    ok(await this.service.getSale(actor, params.saleId));
}
