import type { EventPayloads, OutletRevenue, RevenueTrendPoint } from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";

interface RevenueRow {
  outlet_id: string;
  code: string;
  name: string;
  revenue_minor: number;
  sale_count: number;
  items_sold: number;
}

export interface TopItemRow {
  outlet_id: string;
  code: string;
  name: string;
  rank: number | null;
  menu_item_id: string | null;
  sku: string | null;
  item_name: string | null;
  quantity: number | null;
  revenue_minor: number | null;
}

const average = (revenue: number, count: number): number => (count === 0 ? 0 : Math.round(revenue / count));

/**
 * Reads and writes ONLY the reporting schema. Every number comes from the
 * projections, so reports cost O(outlets x days) no matter how many sales exist.
 */
export class ReportingRepository {
  constructor(private readonly db: Database) {}

  // ---- Projections (event handlers) -------------------------------------------------

  async upsertOutlet(outlet: EventPayloads["outlets.outlet.upserted"]): Promise<void> {
    await this.db.query(
      `INSERT INTO reporting.outlet_directory (outlet_id, code, name, is_active) VALUES ($1, $2, $3, $4)
       ON CONFLICT (outlet_id) DO UPDATE
         SET code = EXCLUDED.code, name = EXCLUDED.name, is_active = EXCLUDED.is_active, updated_at = now()`,
      [outlet.outletId, outlet.code, outlet.name, outlet.isActive],
    );
  }

  async applySale(sale: EventPayloads["sales.sale.completed"]): Promise<void> {
    await this.db.query(
      `INSERT INTO reporting.daily_outlet_sales AS d (outlet_id, business_date, sale_count, items_sold, revenue_minor)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (outlet_id, business_date) DO UPDATE SET
         sale_count    = d.sale_count + 1,
         items_sold    = d.items_sold + EXCLUDED.items_sold,
         revenue_minor = d.revenue_minor + EXCLUDED.revenue_minor,
         updated_at    = now()`,
      [sale.outletId, sale.businessDate, sale.itemCount, sale.totalMinor],
    );
    if (sale.lines.length === 0) return;
    await this.db.query(
      `INSERT INTO reporting.daily_item_sales AS s
         (outlet_id, business_date, menu_item_id, sku, item_name, quantity, revenue_minor)
       SELECT $1, $2, * FROM unnest($3::uuid[], $4::text[], $5::text[], $6::int[], $7::bigint[])
       ON CONFLICT (outlet_id, business_date, menu_item_id) DO UPDATE SET
         quantity      = s.quantity + EXCLUDED.quantity,
         revenue_minor = s.revenue_minor + EXCLUDED.revenue_minor,
         sku           = EXCLUDED.sku,
         item_name     = EXCLUDED.item_name,
         updated_at    = now()`,
      [
        sale.outletId,
        sale.businessDate,
        sale.lines.map((line) => line.menuItemId),
        sale.lines.map((line) => line.sku),
        sale.lines.map((line) => line.itemName),
        sale.lines.map((line) => line.quantity),
        sale.lines.map((line) => line.lineTotalMinor),
      ],
    );
  }

  // ---- Queries ----------------------------------------------------------------------

  async revenueByOutlet(from: string, to: string, outletId: string | undefined): Promise<OutletRevenue[]> {
    const rows = await this.db.many<RevenueRow>(
      `SELECT d.outlet_id, d.code, d.name,
              COALESCE(SUM(s.revenue_minor), 0)::bigint AS revenue_minor,
              COALESCE(SUM(s.sale_count), 0)::int       AS sale_count,
              COALESCE(SUM(s.items_sold), 0)::int       AS items_sold
         FROM reporting.outlet_directory d
         LEFT JOIN reporting.daily_outlet_sales s
           ON s.outlet_id = d.outlet_id AND s.business_date BETWEEN $1 AND $2
        WHERE ($3::uuid IS NULL OR d.outlet_id = $3)
        GROUP BY d.outlet_id, d.code, d.name
        ORDER BY revenue_minor DESC, d.name`,
      [from, to, outletId ?? null],
    );
    return rows.map((row) => ({
      outletId: row.outlet_id,
      outletCode: row.code,
      outletName: row.name,
      revenueMinor: row.revenue_minor,
      saleCount: row.sale_count,
      itemsSold: row.items_sold,
      averageTicketMinor: average(row.revenue_minor, row.sale_count),
    }));
  }

  /** Top N items per outlet in one query: aggregate per item, rank inside each outlet with ROW_NUMBER. */
  topItemsByOutlet(
    from: string,
    to: string,
    outletId: string | undefined,
    limit: number,
  ): Promise<TopItemRow[]> {
    return this.db.many<TopItemRow>(
      `WITH totals AS (
         SELECT outlet_id, menu_item_id,
                SUM(quantity)::int          AS quantity,
                SUM(revenue_minor)::bigint  AS revenue_minor,
                (array_agg(item_name ORDER BY business_date DESC))[1] AS item_name,
                (array_agg(sku ORDER BY business_date DESC))[1]       AS sku
           FROM reporting.daily_item_sales
          WHERE business_date BETWEEN $1 AND $2 AND ($3::uuid IS NULL OR outlet_id = $3)
          GROUP BY outlet_id, menu_item_id
       ), ranked AS (
         SELECT totals.*,
                ROW_NUMBER() OVER (PARTITION BY outlet_id
                                   ORDER BY quantity DESC, revenue_minor DESC, item_name) AS rank
           FROM totals
       )
       SELECT d.outlet_id, d.code, d.name,
              r.rank::int AS rank, r.menu_item_id, r.sku, r.item_name, r.quantity, r.revenue_minor
         FROM reporting.outlet_directory d
         LEFT JOIN ranked r ON r.outlet_id = d.outlet_id AND r.rank <= $4
        WHERE ($3::uuid IS NULL OR d.outlet_id = $3)
        ORDER BY d.name, r.rank`,
      [from, to, outletId ?? null, limit],
    );
  }

  trend(from: string, to: string, outletId: string | undefined): Promise<RevenueTrendPoint[]> {
    return this.db.many<RevenueTrendPoint>(
      `SELECT g.day::date                                 AS date,
              COALESCE(SUM(s.revenue_minor), 0)::bigint   AS "revenueMinor",
              COALESCE(SUM(s.sale_count), 0)::int         AS "saleCount"
         FROM generate_series($1::date, $2::date, interval '1 day') AS g(day)
         LEFT JOIN reporting.daily_outlet_sales s
           ON s.business_date = g.day::date AND ($3::uuid IS NULL OR s.outlet_id = $3)
        GROUP BY g.day
        ORDER BY g.day`,
      [from, to, outletId ?? null],
    );
  }
}
