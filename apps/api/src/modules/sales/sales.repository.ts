import {
  COUNT_CAP,
  type CursorPage,
  type PaymentMethod,
  type Sale,
  type SaleLine,
  type SaleSummary,
} from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";
import { cappedCount, keysetPage, toIso } from "@/platform/db/sql.ts";

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
  requestHash: Buffer | null;
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

  async findByIdempotencyKey(
    outletId: string,
    key: string,
  ): Promise<{ id: string; requestHash: Buffer | null } | undefined> {
    const row = await this.db.one<{ id: string; request_hash: Buffer | null }>(
      "SELECT id, request_hash FROM sales.sales WHERE outlet_id = $1 AND idempotency_key = $2",
      [outletId, key],
    );
    return row && { id: row.id, requestHash: row.request_hash };
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
          idempotency_key, request_hash, cashier_id, cashier_name, occurred_at, business_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, ($12::timestamptz AT TIME ZONE $13)::date)
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
        sale.requestHash,
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

  /**
   * Newest first, one keyset page at a time. The sort key (business_date,
   * occurred_at, id) is unique, and the cursor is the id of the last row shown: the
   * next page starts strictly after that row's key, read through
   * sales_history_idx / sales_outlet_history_idx, so deep pages cost no more than
   * the first. Outlet filters are built into the SQL text (never values) so each
   * shape gets a plan that uses its own index.
   */
  async list(filter: {
    outletId: string | undefined;
    from: string;
    to: string;
    cursor: string | undefined;
    pageSize: number;
  }): Promise<CursorPage<SaleSummary>> {
    const params: unknown[] = [filter.from, filter.to];
    let where = "WHERE business_date BETWEEN $1 AND $2";
    if (filter.outletId) {
      params.push(filter.outletId);
      where += ` AND outlet_id = $${params.length}`;
    }
    const countParams = [...params];
    const countWhere = where;
    if (filter.cursor) {
      params.push(filter.cursor);
      where += ` AND (business_date, occurred_at, id) <
        (SELECT business_date, occurred_at, id FROM sales.sales WHERE id = $${params.length})`;
    }
    params.push(filter.pageSize + 1);
    const [rows, count] = await Promise.all([
      this.db.many<SaleRow>(
        `SELECT ${SALE_COLUMNS} FROM sales.sales ${where}
          ORDER BY business_date DESC, occurred_at DESC, id DESC LIMIT $${params.length}`,
        params,
      ),
      cappedCount(this.db, `FROM sales.sales ${countWhere}`, countParams, COUNT_CAP),
    ]);
    const page = keysetPage(rows, filter.pageSize, (row) => row.id);
    return {
      ...count,
      items: page.items.map(toSummary),
      nextCursor: page.nextCursor,
      pageSize: filter.pageSize,
    };
  }
}
