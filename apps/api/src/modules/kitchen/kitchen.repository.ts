import type { KitchenTicket, KitchenTicketItem, TicketStatus } from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";
import { toIso, toIsoOrNull } from "@/platform/db/sql.ts";

interface TicketRow {
  id: string;
  sale_id: string;
  outlet_id: string;
  receipt_no: string;
  status: TicketStatus;
  items: KitchenTicketItem[];
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  ready_at: Date | null;
  served_at: Date | null;
}

const TICKET_SELECT = `
  SELECT t.id, t.sale_id, t.outlet_id, t.receipt_no, t.status,
         t.created_at, t.updated_at, t.started_at, t.ready_at, t.served_at,
         COALESCE(
           json_agg(json_build_object('lineNo', i.line_no, 'itemName', i.item_name, 'quantity', i.quantity)
                    ORDER BY i.line_no) FILTER (WHERE i.ticket_id IS NOT NULL),
           '[]'
         ) AS items
    FROM kitchen.tickets t
    LEFT JOIN kitchen.ticket_items i ON i.ticket_id = t.id`;

const toTicket = (row: TicketRow): KitchenTicket => ({
  id: row.id,
  saleId: row.sale_id,
  outletId: row.outlet_id,
  receiptNo: row.receipt_no,
  status: row.status,
  items: row.items,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  startedAt: toIsoOrNull(row.started_at),
  readyAt: toIsoOrNull(row.ready_at),
  servedAt: toIsoOrNull(row.served_at),
});

export class KitchenRepository {
  constructor(private readonly db: Database) {}

  /** Returns the new ticket id, or undefined when the sale already has a ticket. */
  async insertTicket(input: {
    saleId: string;
    outletId: string;
    receiptNo: string;
    items: readonly KitchenTicketItem[];
  }): Promise<string | undefined> {
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO kitchen.tickets (sale_id, outlet_id, receipt_no) VALUES ($1, $2, $3)
       ON CONFLICT (sale_id) DO NOTHING RETURNING id`,
      [input.saleId, input.outletId, input.receiptNo],
    );
    if (!row) return undefined;
    await this.db.query(
      `INSERT INTO kitchen.ticket_items (ticket_id, line_no, item_name, quantity)
       SELECT $1, * FROM unnest($2::smallint[], $3::text[], $4::int[])`,
      [
        row.id,
        input.items.map((item) => item.lineNo),
        input.items.map((item) => item.itemName),
        input.items.map((item) => item.quantity),
      ],
    );
    return row.id;
  }

  async list(outletId: string, scope: "active" | "all"): Promise<KitchenTicket[]> {
    const rows = await this.db.many<TicketRow>(
      `${TICKET_SELECT}
        WHERE t.outlet_id = $1
          AND ($2::text = 'all' OR t.status <> 'SERVED')
          AND t.created_at > now() - interval '24 hours'
        GROUP BY t.id
        ORDER BY t.created_at
        LIMIT 200`,
      [outletId, scope],
    );
    return rows.map(toTicket);
  }

  async findById(ticketId: string, options: { lock?: boolean } = {}): Promise<KitchenTicket | undefined> {
    if (options.lock) {
      await this.db.query("SELECT 1 FROM kitchen.tickets WHERE id = $1 FOR UPDATE", [ticketId]);
    }
    const row = await this.db.one<TicketRow>(`${TICKET_SELECT} WHERE t.id = $1 GROUP BY t.id`, [ticketId]);
    return row && toTicket(row);
  }

  async updateStatus(ticketId: string, status: TicketStatus): Promise<void> {
    await this.db.query(
      `UPDATE kitchen.tickets SET
         status     = $2::varchar,
         started_at = CASE WHEN $2 = 'NEW' THEN NULL ELSE COALESCE(started_at, now()) END,
         ready_at   = CASE WHEN $2 IN ('READY', 'SERVED') THEN COALESCE(ready_at, now()) ELSE NULL END,
         served_at  = CASE WHEN $2 = 'SERVED' THEN now() ELSE NULL END
       WHERE id = $1`,
      [ticketId, status],
    );
  }
}
