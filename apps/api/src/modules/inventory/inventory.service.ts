import type {
  AdjustStockRequest,
  ListMovementsQuery,
  Paginated,
  StockLevel,
  StockMovement,
  StockReason,
} from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import type { Database } from "@/platform/db/database.ts";
import type { Outbox } from "@/platform/events/outbox.ts";
import { InsufficientStockError, NotFoundError } from "@/platform/http/errors.ts";
import type { InventoryRepository } from "./inventory.repository.ts";

export interface SaleDeduction {
  outletId: string;
  saleId: string;
  /** Unique menu item ids with positive quantities. */
  lines: readonly { menuItemId: string; quantity: number }[];
  actor: Actor;
}

export class InventoryService {
  constructor(
    private readonly db: Database,
    private readonly repository: InventoryRepository,
    private readonly outbox: Outbox,
  ) {}

  listStock(outletId: string): Promise<StockLevel[]> {
    return this.repository.listLevels(outletId);
  }

  listMovements(outletId: string, query: ListMovementsQuery): Promise<Paginated<StockMovement>> {
    return this.repository
      .listMovements(outletId, query)
      .then(({ items, total }) => ({ items, total, page: query.page, pageSize: query.pageSize }));
  }

  /** Manual restock, correction or waste. Refuses any change that would go below zero. */
  adjust(outletId: string, menuItemId: string, input: AdjustStockRequest, actor: Actor): Promise<StockLevel> {
    return this.db.transaction(async () => {
      const level = await this.repository.adjustIfEnough(outletId, menuItemId, input.delta);
      if (!level) {
        const current = await this.repository.findLevel(outletId, menuItemId);
        if (!current) throw new NotFoundError("Stock for this item at this outlet");
        throw new InsufficientStockError([
          { menuItemId, requested: -input.delta, available: current.onHand },
        ]);
      }
      await this.repository.insertMovements([
        {
          outletId,
          menuItemId,
          delta: input.delta,
          balanceAfter: level.onHand,
          reason: input.reason,
          note: input.note,
          actorId: actor.id,
          actorName: actor.fullName,
        },
      ]);
      await this.#announce(level, input.delta, input.reason);
      return level;
    });
  }

  async updateThreshold(outletId: string, menuItemId: string, threshold: number): Promise<StockLevel> {
    const level = await this.repository.updateThreshold(outletId, menuItemId, threshold);
    if (!level) throw new NotFoundError("Stock for this item at this outlet");
    return level;
  }

  // ---- Public API for other modules -------------------------------------------------

  /** Opens the stock level for a newly assigned item. Called by Catalog inside its transaction. */
  initializeStock(input: {
    outletId: string;
    menuItemId: string;
    quantity: number;
    actor: Actor;
  }): Promise<void> {
    return this.db.transaction(async () => {
      const inserted = await this.repository.insertLevel(input.outletId, input.menuItemId, input.quantity);
      if (!inserted || input.quantity === 0) return;
      await this.repository.insertMovements([
        {
          outletId: input.outletId,
          menuItemId: input.menuItemId,
          delta: input.quantity,
          balanceAfter: input.quantity,
          reason: "INITIAL",
          actorId: input.actor.id,
          actorName: input.actor.fullName,
        },
      ]);
    });
  }

  /**
   * Deducts the stock of a sale. Runs inside the sale's transaction (it joins it),
   * so the deduction and the sale commit or roll back together.
   *
   * 1. Lock every affected row in a fixed order (no deadlocks).
   * 2. Check all lines at once, so the cashier sees every shortfall, not just the first.
   * 3. Apply all deltas in one statement and write the audit trail.
   */
  deductForSale(deduction: SaleDeduction): Promise<StockLevel[]> {
    return this.db.transaction(async () => {
      const ids = deduction.lines.map((line) => line.menuItemId);
      const locked = new Map(
        (await this.repository.lockLevels(deduction.outletId, ids)).map((level) => [level.menuItemId, level]),
      );

      const shortfalls = deduction.lines
        .map((line) => ({
          menuItemId: line.menuItemId,
          requested: line.quantity,
          available: locked.get(line.menuItemId)?.onHand ?? 0,
        }))
        .filter((line) => line.available < line.requested);
      if (shortfalls.length > 0) throw new InsufficientStockError(shortfalls);

      const levels = await this.repository.applyDeltas(
        deduction.outletId,
        deduction.lines.map((line) => ({ menuItemId: line.menuItemId, delta: -line.quantity })),
      );
      const byItem = new Map(levels.map((level) => [level.menuItemId, level]));

      await this.repository.insertMovements(
        deduction.lines.map((line) => ({
          outletId: deduction.outletId,
          menuItemId: line.menuItemId,
          delta: -line.quantity,
          balanceAfter: byItem.get(line.menuItemId)?.onHand ?? 0,
          reason: "SALE" as const,
          referenceType: "SALE",
          referenceId: deduction.saleId,
          actorId: deduction.actor.id,
          actorName: deduction.actor.fullName,
        })),
      );
      for (const line of deduction.lines) {
        const level = byItem.get(line.menuItemId);
        if (level) await this.#announce(level, -line.quantity, "SALE");
      }
      return levels;
    });
  }

  async #announce(level: StockLevel, delta: number, reason: StockReason): Promise<void> {
    await this.outbox.publish(
      "inventory.stock.changed",
      { type: "stock_level", id: level.menuItemId },
      {
        outletId: level.outletId,
        menuItemId: level.menuItemId,
        onHand: level.onHand,
        delta,
        reason,
        isLow: level.isLow,
      },
    );
  }
}
