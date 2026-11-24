import { createHash, randomUUID } from "node:crypto";
import type {
  CreateSaleRequest,
  CursorPage,
  ListSalesQuery,
  Outlet,
  Sale,
  SaleLine,
  SaleSummary,
} from "@tablewise/contracts";
import { type Actor, canAccessOutlet, scopeOutlet } from "@/platform/auth/actor.ts";
import { type Database, isUniqueViolation } from "@/platform/db/database.ts";
import type { Outbox } from "@/platform/events/outbox.ts";
import { resolveRange } from "@/platform/time.ts";
import {
  IdempotencyKeyReusedError,
  ItemsNotSellableError,
  NotFoundError,
  ValidationError,
} from "@/platform/http/errors.ts";
import type { SalesRepository } from "./sales.repository.ts";

/** Ports: what Sales needs from other modules, declared here and implemented elsewhere. */
export interface SalesOutletsPort {
  requireActive(outletId: string): Promise<Outlet>;
}

export interface SalesCatalogPort {
  sellableItems(
    outletId: string,
    menuItemIds: readonly string[],
  ): Promise<{ menuItemId: string; sku: string; name: string; priceMinor: number }[]>;
}

export interface SalesInventoryPort {
  deductForSale(deduction: {
    outletId: string;
    saleId: string;
    lines: readonly { menuItemId: string; quantity: number }[];
    actor: Actor;
  }): Promise<unknown>;
}

export interface CreateSaleCommand {
  outletId: string;
  request: CreateSaleRequest;
  idempotencyKey: string | undefined;
  actor: Actor;
  /** Seeder only: allows any historical `occurredAt`. */
  trustedBackfill?: boolean;
}

const MAX_BACKDATE_MS = 72 * 60 * 60_000;
const DEFAULT_LIST_DAYS = 30;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/** Merges repeated items and sorts by id: one line per item, and a stable lock order. */
function normalizeLines(lines: CreateSaleRequest["lines"]): { menuItemId: string; quantity: number }[] {
  const quantities = new Map<string, number>();
  for (const line of lines)
    quantities.set(line.menuItemId, (quantities.get(line.menuItemId) ?? 0) + line.quantity);
  return [...quantities.entries()]
    .map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
    .sort((a, b) => (a.menuItemId < b.menuItemId ? -1 : 1));
}

/**
 * Fingerprint of what a retry must repeat. Built from the normalised lines, so the
 * same order sent with its lines in another order or split differently still matches.
 * `occurredAt` is compared as an instant, so "+06:00" and "Z" spellings agree.
 */
function requestHash(
  lines: readonly { menuItemId: string; quantity: number }[],
  request: CreateSaleRequest,
): Buffer {
  const occurredAt = request.occurredAt === undefined ? null : Date.parse(request.occurredAt);
  const canonical = JSON.stringify([
    lines.map((line) => [line.menuItemId.toLowerCase(), line.quantity]),
    request.paymentMethod,
    occurredAt,
  ]);
  return createHash("sha256").update(canonical).digest();
}

export class SalesService {
  constructor(
    private readonly db: Database,
    private readonly repository: SalesRepository,
    private readonly outbox: Outbox,
    private readonly ports: {
      outlets: SalesOutletsPort;
      catalog: SalesCatalogPort;
      inventory: SalesInventoryPort;
    },
    private readonly options: { businessTimeZone: string },
  ) {}

  /**
   * Records a sale as ONE database transaction:
   *
   *   idempotency check -> outlet may trade -> items sellable + priced
   *   -> lock and deduct stock (fails on any shortfall) -> next receipt number
   *   -> sale + lines -> outbox event
   *
   * Any failure rolls back everything, including the receipt counter, so numbering
   * stays gap-free. The receipt counter is taken last to hold its per-outlet lock
   * for the shortest possible time.
   */
  async createSale(command: CreateSaleCommand): Promise<{ sale: Sale; replayed: boolean }> {
    const { outletId, request, idempotencyKey, actor } = command;
    const lines = normalizeLines(request.lines);
    const hash = idempotencyKey ? requestHash(lines, request) : null;

    try {
      return await this.db.transaction(async () => {
        if (idempotencyKey && hash) {
          await this.repository.lockIdempotencyKey(outletId, idempotencyKey);
          const replay = await this.#replay(outletId, idempotencyKey, hash);
          if (replay) return replay;
        }

        // Validated after the replay check: a retry of a sale that was accepted near
        // the end of the backdating window must still get the original sale back.
        const occurredAt = this.#resolveOccurredAt(request.occurredAt, command.trustedBackfill === true);

        const outlet = await this.ports.outlets.requireActive(outletId);
        const ids = lines.map((line) => line.menuItemId);
        const priced = new Map(
          (await this.ports.catalog.sellableItems(outletId, ids)).map((i) => [i.menuItemId, i]),
        );
        const notSellable = ids.filter((id) => !priced.has(id));
        if (notSellable.length > 0) throw new ItemsNotSellableError(notSellable);

        const saleId = randomUUID();
        await this.ports.inventory.deductForSale({ outletId, saleId, lines, actor });

        const saleLines: SaleLine[] = lines.map((line, index) => {
          const item = priced.get(line.menuItemId);
          if (!item) throw new ItemsNotSellableError([line.menuItemId]);
          return {
            lineNo: index + 1,
            menuItemId: item.menuItemId,
            sku: item.sku,
            itemName: item.name,
            unitPriceMinor: item.priceMinor,
            quantity: line.quantity,
            lineTotalMinor: item.priceMinor * line.quantity,
          };
        });

        const receiptSeq = await this.repository.nextReceiptSeq(outletId);
        const summary = await this.repository.insertSale({
          id: saleId,
          outletId,
          receiptSeq,
          receiptNo: `${outlet.code}-${String(receiptSeq).padStart(6, "0")}`,
          paymentMethod: request.paymentMethod,
          totalMinor: saleLines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
          itemCount: saleLines.reduce((sum, line) => sum + line.quantity, 0),
          idempotencyKey: idempotencyKey ?? null,
          requestHash: hash,
          cashierId: actor.id,
          cashierName: actor.fullName,
          occurredAt,
          timezone: outlet.timezone,
        });
        await this.repository.insertLines(saleId, saleLines);

        const sale: Sale = { ...summary, lines: saleLines };
        await this.outbox.publish(
          "sales.sale.completed",
          { type: "sale", id: sale.id },
          {
            saleId: sale.id,
            outletId: sale.outletId,
            receiptNo: sale.receiptNo,
            totalMinor: sale.totalMinor,
            itemCount: sale.itemCount,
            paymentMethod: sale.paymentMethod,
            businessDate: sale.businessDate,
            cashierName: sale.cashierName,
            occurredAt: sale.occurredAt,
            createdAt: sale.createdAt,
            lines: saleLines,
          },
        );
        return { sale, replayed: false };
      });
    } catch (error) {
      // Defence in depth: the unique constraint is the final guard against duplicates.
      if (idempotencyKey && hash && isUniqueViolation(error, "sales_outlet_idempotency_key")) {
        const replay = await this.#replay(outletId, idempotencyKey, hash);
        if (replay) return replay;
      }
      throw error;
    }
  }

  async getSale(actor: Actor, saleId: string): Promise<Sale> {
    const sale = await this.repository.findById(saleId);
    // Another outlet's sale is reported as missing: its existence is not the caller's business.
    if (!sale || !canAccessOutlet(actor, sale.outletId)) throw new NotFoundError("Sale", saleId);
    return sale;
  }

  /** Newest first. Without a date range it covers the last 30 trading days, so a bare call stays cheap. */
  async listSales(actor: Actor, query: ListSalesQuery): Promise<CursorPage<SaleSummary>> {
    const { from, to } = resolveRange(query, DEFAULT_LIST_DAYS, this.options.businessTimeZone);
    return this.repository.list({
      outletId: scopeOutlet(actor, query.outletId),
      from,
      to,
      cursor: query.cursor,
      pageSize: query.pageSize,
    });
  }

  /** The sale already recorded under this key, provided the request is the same one. */
  async #replay(
    outletId: string,
    idempotencyKey: string,
    hash: Buffer,
  ): Promise<{ sale: Sale; replayed: true } | undefined> {
    const existing = await this.repository.findByIdempotencyKey(outletId, idempotencyKey);
    if (!existing) return undefined;
    if (existing.requestHash && !existing.requestHash.equals(hash)) throw new IdempotencyKeyReusedError();
    return { sale: await this.#load(existing.id), replayed: true };
  }

  async #load(saleId: string): Promise<Sale> {
    const sale = await this.repository.findById(saleId);
    if (!sale) throw new NotFoundError("Sale", saleId);
    return sale;
  }

  #resolveOccurredAt(value: string | undefined, trusted: boolean): Date {
    const now = Date.now();
    if (!value) return new Date(now);
    const time = Date.parse(value);
    if (!trusted) {
      if (time > now + MAX_CLOCK_SKEW_MS) {
        throw new ValidationError([{ path: "body.occurredAt", message: "cannot be in the future" }]);
      }
      if (time < now - MAX_BACKDATE_MS) {
        throw new ValidationError([{ path: "body.occurredAt", message: "must be within the last 72 hours" }]);
      }
    }
    return new Date(time);
  }
}
