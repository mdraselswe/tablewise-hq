import {
  COUNT_CAP,
  type CursorPage,
  type ListMovementsQuery,
  type StockLevel,
  type StockMovement,
  type StockReason,
} from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";
import { cappedCount, keysetPage, toIso } from "@/platform/db/sql.ts";

interface LevelRow {
  outlet_id: string;
  menu_item_id: string;
  on_hand: number;
  low_stock_threshold: number;
  updated_at: Date;
}

interface MovementRow {
  id: number;
  outlet_id: string;
  menu_item_id: string;
  delta: number;
  balance_after: number;
  reason: StockReason;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: Date;
}

export interface NewMovement {
  outletId: string;
  menuItemId: string;
  delta: number;
  balanceAfter: number;
  reason: StockReason;
  referenceType?: string;
  referenceId?: string;
  note?: string | undefined;
  actorId: string | null;
  actorName: string | null;
}

const LEVEL_COLUMNS = "outlet_id, menu_item_id, on_hand, low_stock_threshold, updated_at";

export const toLevel = (row: LevelRow): StockLevel => ({
  outletId: row.outlet_id,
  menuItemId: row.menu_item_id,
  onHand: row.on_hand,
  lowStockThreshold: row.low_stock_threshold,
  isLow: row.on_hand <= row.low_stock_threshold,
  updatedAt: toIso(row.updated_at),
});

const toMovement = (row: MovementRow): StockMovement => ({
  id: String(row.id),
  outletId: row.outlet_id,
  menuItemId: row.menu_item_id,
  delta: row.delta,
  balanceAfter: row.balance_after,
  reason: row.reason,
  referenceType: row.reference_type,
  referenceId: row.reference_id,
  note: row.note,
  actorId: row.actor_id,
  actorName: row.actor_name,
  createdAt: toIso(row.created_at),
});

export class InventoryRepository {
  constructor(private readonly db: Database) {}

  async listLevels(outletId: string): Promise<StockLevel[]> {
    const rows = await this.db.many<LevelRow>(
      `SELECT ${LEVEL_COLUMNS} FROM inventory.stock_levels WHERE outlet_id = $1`,
      [outletId],
    );
    return rows.map(toLevel);
  }

  async findLevel(outletId: string, menuItemId: string): Promise<StockLevel | undefined> {
    const row = await this.db.one<LevelRow>(
      `SELECT ${LEVEL_COLUMNS} FROM inventory.stock_levels WHERE outlet_id = $1 AND menu_item_id = $2`,
      [outletId, menuItemId],
    );
    return row && toLevel(row);
  }

  async insertLevel(outletId: string, menuItemId: string, onHand: number): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO inventory.stock_levels (outlet_id, menu_item_id, on_hand)
       VALUES ($1, $2, $3) ON CONFLICT (outlet_id, menu_item_id) DO NOTHING`,
      [outletId, menuItemId, onHand],
    );
    return result.rowCount === 1;
  }

  /**
   * Locks the stock rows of a sale with SELECT ... FOR UPDATE, always in
   * menu_item_id order. A fixed lock order means two concurrent multi-item sales
   * can never wait on each other in a cycle, so they cannot deadlock.
   */
  async lockLevels(outletId: string, menuItemIds: readonly string[]): Promise<StockLevel[]> {
    const rows = await this.db.many<LevelRow>(
      `SELECT ${LEVEL_COLUMNS} FROM inventory.stock_levels
        WHERE outlet_id = $1 AND menu_item_id = ANY($2::uuid[])
        ORDER BY menu_item_id
        FOR UPDATE`,
      [outletId, menuItemIds],
    );
    return rows.map(toLevel);
  }

  /** Applies many deltas in one statement. Callers must hold the row locks (see lockLevels). */
  async applyDeltas(
    outletId: string,
    deltas: readonly { menuItemId: string; delta: number }[],
  ): Promise<StockLevel[]> {
    const rows = await this.db.many<LevelRow>(
      `UPDATE inventory.stock_levels AS s
          SET on_hand = s.on_hand + d.delta
         FROM unnest($2::uuid[], $3::int[]) AS d(menu_item_id, delta)
        WHERE s.outlet_id = $1 AND s.menu_item_id = d.menu_item_id
        RETURNING s.outlet_id, s.menu_item_id, s.on_hand, s.low_stock_threshold, s.updated_at`,
      [outletId, deltas.map((d) => d.menuItemId), deltas.map((d) => d.delta)],
    );
    return rows.map(toLevel);
  }

  /**
   * Conditional single-row change: the WHERE clause refuses to go below zero, so
   * check-and-update is one atomic statement with no race window.
   */
  async adjustIfEnough(outletId: string, menuItemId: string, delta: number): Promise<StockLevel | undefined> {
    const row = await this.db.one<LevelRow>(
      `UPDATE inventory.stock_levels
          SET on_hand = on_hand + $3
        WHERE outlet_id = $1 AND menu_item_id = $2 AND on_hand + $3 >= 0
        RETURNING ${LEVEL_COLUMNS}`,
      [outletId, menuItemId, delta],
    );
    return row && toLevel(row);
  }

  async updateThreshold(
    outletId: string,
    menuItemId: string,
    threshold: number,
  ): Promise<StockLevel | undefined> {
    const row = await this.db.one<LevelRow>(
      `UPDATE inventory.stock_levels SET low_stock_threshold = $3
        WHERE outlet_id = $1 AND menu_item_id = $2
        RETURNING ${LEVEL_COLUMNS}`,
      [outletId, menuItemId, threshold],
    );
    return row && toLevel(row);
  }

  async insertMovements(movements: readonly NewMovement[]): Promise<void> {
    if (movements.length === 0) return;
    await this.db.query(
      `INSERT INTO inventory.stock_movements
         (outlet_id, menu_item_id, delta, balance_after, reason, reference_type, reference_id, note, actor_id, actor_name)
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::int[], $4::int[], $5::text[], $6::text[],
                            $7::uuid[], $8::text[], $9::uuid[], $10::text[])`,
      [
        movements.map((m) => m.outletId),
        movements.map((m) => m.menuItemId),
        movements.map((m) => m.delta),
        movements.map((m) => m.balanceAfter),
        movements.map((m) => m.reason),
        movements.map((m) => m.referenceType ?? null),
        movements.map((m) => m.referenceId ?? null),
        movements.map((m) => m.note ?? null),
        movements.map((m) => m.actorId),
        movements.map((m) => m.actorName),
      ],
    );
  }

  /**
   * The audit trail, newest first, within a rolling window. Keyset pagination on
   * (created_at, id), read through stock_movements_outlet_created_idx (or the
   * per-item index when filtered by item), so deep pages stay as cheap as the first.
   */
  async listMovements(outletId: string, query: ListMovementsQuery): Promise<CursorPage<StockMovement>> {
    const params: unknown[] = [outletId, query.days];
    let where = "WHERE outlet_id = $1 AND created_at >= now() - make_interval(days => $2)";
    if (query.menuItemId) {
      params.push(query.menuItemId);
      where += ` AND menu_item_id = $${params.length}`;
    }
    if (query.reason) {
      params.push(query.reason);
      where += ` AND reason = $${params.length}`;
    }
    const countParams = [...params];
    const countWhere = where;
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND (created_at, id) <
        (SELECT created_at, id FROM inventory.stock_movements WHERE id = $${params.length})`;
    }
    params.push(query.pageSize + 1);
    const [rows, count] = await Promise.all([
      this.db.many<MovementRow>(
        `SELECT * FROM inventory.stock_movements ${where}
          ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
        params,
      ),
      cappedCount(this.db, `FROM inventory.stock_movements ${countWhere}`, countParams, COUNT_CAP),
    ]);
    const page = keysetPage(rows, query.pageSize, (row) => String(row.id));
    return {
      ...count,
      items: page.items.map(toMovement),
      nextCursor: page.nextCursor,
      pageSize: query.pageSize,
    };
  }
}
