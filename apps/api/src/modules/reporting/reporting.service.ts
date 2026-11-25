import type {
  OutletTopItems,
  ReportQuery,
  ReportRange,
  RevenueReport,
  RevenueTrend,
  TopItemsQuery,
  TopItemsReport,
} from "@tablewise/contracts";
import { type Actor, scopeOutlet } from "@/platform/auth/actor.ts";
import { ValidationError } from "@/platform/http/errors.ts";
import { daysBetween, resolveRange } from "@/platform/time.ts";
import type { ReportingRepository } from "./reporting.repository.ts";

const MAX_RANGE_DAYS = 366;
/** A bare report call covers the last week, so it still shows data on a quiet day. */
const DEFAULT_REPORT_DAYS = 7;

export class ReportingService {
  constructor(
    private readonly repository: ReportingRepository,
    private readonly businessTimeZone: string,
  ) {}

  /** Total revenue, sale count and average ticket per outlet. Defaults to the last 7 days. */
  async revenue(actor: Actor, query: ReportQuery): Promise<RevenueReport> {
    const range = this.#range(query, DEFAULT_REPORT_DAYS);
    const outlets = await this.repository.revenueByOutlet(
      range.from,
      range.to,
      scopeOutlet(actor, query.outletId),
    );
    const revenueMinor = outlets.reduce((sum, outlet) => sum + outlet.revenueMinor, 0);
    const saleCount = outlets.reduce((sum, outlet) => sum + outlet.saleCount, 0);
    const itemsSold = outlets.reduce((sum, outlet) => sum + outlet.itemsSold, 0);
    return {
      range,
      totals: {
        revenueMinor,
        saleCount,
        itemsSold,
        averageTicketMinor: saleCount === 0 ? 0 : Math.round(revenueMinor / saleCount),
      },
      outlets,
    };
  }

  /** Top N (default 5) items by quantity per outlet. Defaults to the last 7 days. */
  async topItems(actor: Actor, query: TopItemsQuery): Promise<TopItemsReport> {
    const range = this.#range(query, DEFAULT_REPORT_DAYS);
    const rows = await this.repository.topItemsByOutlet(
      range.from,
      range.to,
      scopeOutlet(actor, query.outletId),
      query.limit,
    );
    const byOutlet = new Map<string, OutletTopItems>();
    for (const row of rows) {
      const outlet = byOutlet.get(row.outlet_id) ?? {
        outletId: row.outlet_id,
        outletCode: row.code,
        outletName: row.name,
        items: [],
      };
      if (row.menu_item_id && row.rank !== null) {
        outlet.items.push({
          rank: row.rank,
          menuItemId: row.menu_item_id,
          sku: row.sku ?? "",
          itemName: row.item_name ?? "",
          quantity: row.quantity ?? 0,
          revenueMinor: row.revenue_minor ?? 0,
        });
      }
      byOutlet.set(row.outlet_id, outlet);
    }
    return { range, outlets: [...byOutlet.values()] };
  }

  /** Daily revenue series for charts. Defaults to the last 14 days. */
  async trend(actor: Actor, query: ReportQuery): Promise<RevenueTrend> {
    const range = this.#range(query, 14);
    const points = await this.repository.trend(range.from, range.to, scopeOutlet(actor, query.outletId));
    return { range, points };
  }

  #range(query: { from?: string | undefined; to?: string | undefined }, defaultDays: number): ReportRange {
    const { from, to } = resolveRange(query, defaultDays, this.businessTimeZone);
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      throw new ValidationError([
        { path: "query.from", message: `A report can cover at most ${MAX_RANGE_DAYS} days` },
      ]);
    }
    return { from, to };
  }
}
