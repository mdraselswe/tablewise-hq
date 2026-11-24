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
import type { ReportingRepository } from "./reporting.repository.ts";

const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" for the current day in a time zone ("en-CA" formats dates as ISO). */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export class ReportingService {
  constructor(
    private readonly repository: ReportingRepository,
    private readonly businessTimeZone: string,
  ) {}

  /** Total revenue, sale count and average ticket per outlet. Defaults to today. */
  async revenue(actor: Actor, query: ReportQuery): Promise<RevenueReport> {
    const range = this.#range(query, 1);
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

  /** Top N (default 5) items by quantity per outlet. Defaults to today. */
  async topItems(actor: Actor, query: TopItemsQuery): Promise<TopItemsReport> {
    const range = this.#range(query, 1);
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
    const to = query.to ?? todayIn(this.businessTimeZone);
    const from = query.from ?? addDays(to, -(defaultDays - 1));
    const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
    if (days > MAX_RANGE_DAYS) {
      throw new ValidationError([
        { path: "query.from", message: `A report can cover at most ${MAX_RANGE_DAYS} days` },
      ]);
    }
    return { from, to };
  }
}
