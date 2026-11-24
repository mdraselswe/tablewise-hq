import type { ReportQuery, TopItemsQuery } from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import { type HttpContext, type HttpReply, ok } from "@/platform/http/route.ts";
import type { ReportingService } from "./reporting.service.ts";

type Ctx<Q> = HttpContext<unknown, Q, undefined, Actor>;

export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  revenue = async ({ actor, query }: Ctx<ReportQuery>): Promise<HttpReply> =>
    ok(await this.service.revenue(actor, query));

  topItems = async ({ actor, query }: Ctx<TopItemsQuery>): Promise<HttpReply> =>
    ok(await this.service.topItems(actor, query));

  trend = async ({ actor, query }: Ctx<ReportQuery>): Promise<HttpReply> =>
    ok(await this.service.trend(actor, query));
}
