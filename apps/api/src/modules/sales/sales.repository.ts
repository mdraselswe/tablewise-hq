import type { ListSalesQuery, PaymentMethod, Sale, SaleLine, SaleSummary } from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";
import { pageWindow, toIso } from "@/platform/db/sql.ts";

interface SaleRow {
  id: string;
  outlet_id: string;
  receipt_seq: number;
  receipt_no: string;
  payment_method: PaymentMethod;
  total_minor: number;
  item_count: number;
  cashier_id: string | null;
  cashier_name: string | null;
  business_date: string;
  occurred_at: Date;
  created_at: Date;
}

interface LineRow {
  line_no: number;
  menu_item_id: string;
  sku: string;
  item_name: string;
  unit_price_minor: number;
  quantity: number;
  line_total_minor: number;
}

export interface NewSale {
  id: string;
  outletId: string;
  receiptSeq: number;
  receiptNo: string;
  paymentMethod: PaymentMethod;
  totalMinor: number;
  itemCount: number;
  idempotencyKey: string | null;
  cashierId: string;
  cashierName: string;
  occurredAt: Date;
  timezone: string;
}

const SALE_COLUMNS = `id, outlet_id, receipt_seq, receipt_no, payment_method, total_minor, item_count,
  cashier_id, cashier_name, business_date, occurred_at, created_at`;

const toSummary = (row: SaleRow): SaleSummary => ({
  id: row.id,
  outletId: row.outlet_id,
  receiptNo: row.receipt_no,
  receiptSeq: row.receipt_seq,
  paymentMethod: row.payment_method,
  totalMinor: row.total_minor,
  itemCount: row.item_count,
  cashierId: row.cashier_id,
  cashierName: row.cashier_name,
  businessDate: row.business_date,
  occurredAt: toIso(row.occurred_at),
  createdAt: toIso(row.created_at),
});

const toLine = (row: LineRow): SaleLine => ({
  lineNo: row.line_no,
  menuItemId: row.menu_item_id,
  sku: row.sku,
  itemName: row.item_name,
  unitPriceMinor: row.unit_price_minor,
  quantity: row.quantity,
  lineTotalMinor: row.line_total_minor,
});

export class SalesRepository {
  constructor(private readonly db: Database) {}

  /**
   * Serialises concurrent requests that carry the same idempotency key: the second
   * waits here until the first commits, then finds its sale instead of racing it.
   * The lock is released automatically at the end of the transaction.
   */
  async lockIdempotencyKey(outletId: string, key: string): Promise<void> {
    await this.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`sale:${outletId}:${key}`]);
  }

  async findIdByIdempotencyKey(outletId: string, key: string): Promise<string | undefined> {
    const row = await this.db.one<{ id: string }>(
      "SELECT id FROM sales.sales WHERE outlet_id = $1 AND idempotency_key = $2",
      [outletId, key],
    );
    return row?.id;
  }

  /**
   * Next receipt number for an outlet. The upsert creates the counter on first use
   * and otherwise increments it while holding the row lock until COMMIT, which is
   * what makes numbering gap-free and strictly sequential under concurrency.
   */
  async nextReceiptSeq(outletId: string): Promise<number> {
    const row = await this.db.one<{ last_value: number }>(
      `INSERT INTO sales.receipt_sequences AS rs (outlet_id, last_value) VALUES ($1, 1)
       ON CONFLICT (outlet_id) DO UPDATE SET last_value = rs.last_value + 1, updated_at = now()
       RETURNING last_value`,
      [outletId],
    );
    if (!row) throw new Error("Receipt sequence upsert returned no row");
    return row.last_value;
  }

  async insertSale(sale: NewSale): Promise<SaleSummary> {
    const row = await this.db.one<SaleRow>(
      `INSERT INTO sales.sales
         (id, outlet_id, receipt_seq, receipt_no, payment_method, total_minor, item_count,
          idempotency_key, cashier_id, cashier_name, occurred_at, business_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ($11::timestamptz AT TIME ZONE $12)::date)
       RETURNING ${SALE_COLUMNS}`,
      [
        sale.id,
        sale.outletId,
        sale.receiptSeq,
        sale.receiptNo,
        sale.paymentMethod,
        sale.totalMinor,
        sale.itemCount,
        sale.idempotencyKey,
        sale.cashierId,
        sale.cashierName,
        sale.occurredAt,
        sale.timezone,
      ],
    );
    if (!row) throw new Error("INSERT ... RETURNING returned no row");
    return toSummary(row);
  }

  async insertLines(saleId: string, lines: readonly SaleLine[]): Promise<void> {
    await this.db.query(
      `INSERT INTO sales.sale_lines
         (sale_id, line_no, menu_item_id, sku, item_name, unit_price_minor, quantity, line_total_minor)
       SELECT $1, * FROM unnest($2::smallint[], $3::uuid[], $4::text[], $5::text[], $6::int[], $7::int[], $8::bigint[])`,
      [
        saleId,
        lines.map((line) => line.lineNo),
        lines.map((line) => line.menuItemId),
        lines.map((line) => line.sku),
        lines.map((line) => line.itemName),
        lines.map((line) => line.unitPriceMinor),
        lines.map((line) => line.quantity),
        lines.map((line) => line.lineTotalMinor),
      ],
    );
  }

  async findById(saleId: string): Promise<Sale | undefined> {
    const row = await this.db.one<SaleRow>(`SELECT ${SALE_COLUMNS} FROM sales.sales WHERE id = $1`, [saleId]);
    if (!row) return undefined;
    const lines = await this.db.many<LineRow>(
      `SELECT line_no, menu_item_id, sku, item_name, unit_price_minor, quantity, line_total_minor
         FROM sales.sale_lines WHERE sale_id = $1 ORDER BY line_no`,
      [saleId],
    );
    return { ...toSummary(row), lines: lines.map(toLine) };
  }

  async list(
    query: ListSalesQuery,
    outletId: string | undefined,
  ): Promise<{ items: SaleSummary[]; total: number }> {
    const filters = `
      WHERE ($1::uuid IS NULL OR outlet_id = $1)
        AND ($2::date IS NULL OR business_date >= $2)
        AND ($3::date IS NULL OR business_date <= $3)`;
    const params = [outletId ?? null, query.from ?? null, query.to ?? null];
    const { limit, offset } = pageWindow(query.page, query.pageSize);
    const [rows, count] = await Promise.all([
      this.db.many<SaleRow>(
        `SELECT ${SALE_COLUMNS} FROM sales.sales ${filters}
          ORDER BY business_date DESC, occurred_at DESC, receipt_seq DESC LIMIT $4 OFFSET $5`,
        [...params, limit, offset],
      ),
      this.db.one<{ total: number }>(`SELECT count(*)::int AS total FROM sales.sales ${filters}`, params),
    ]);
    return { items: rows.map(toSummary), total: count?.total ?? 0 };
  }
}
