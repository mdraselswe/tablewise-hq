import type {
  CreateMenuItemRequest,
  ListMenuItemsQuery,
  MenuItem,
  Outlet,
  OutletAssignment,
  OutletMenuItem,
  Paginated,
  UpdateMenuItemRequest,
  UpsertAssignmentRequest,
} from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import type { Database } from "@/platform/db/database.ts";
import { ConflictError, NotFoundError } from "@/platform/http/errors.ts";
import type { CatalogRepository, SellableItem } from "./catalog.repository.ts";

/**
 * Ports: what Catalog needs from other modules, declared by Catalog itself
 * (dependency inversion). The composition root plugs in the in-process modules
 * today; an HTTP or gRPC client can implement the same interface tomorrow.
 */
export interface CatalogOutletsPort {
  require(outletId: string): Promise<Outlet>;
}

export interface CatalogInventoryPort {
  initializeStock(input: {
    outletId: string;
    menuItemId: string;
    quantity: number;
    actor: Actor;
  }): Promise<void>;
}

export class CatalogService {
  constructor(
    private readonly db: Database,
    private readonly repository: CatalogRepository,
    private readonly outlets: CatalogOutletsPort,
    private readonly inventory: CatalogInventoryPort,
  ) {}

  // ---- Master menu (HQ) -------------------------------------------------------------

  async listMenuItems(query: ListMenuItemsQuery): Promise<Paginated<MenuItem>> {
    const { items, total } = await this.repository.listMenuItems(query);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  listCategories(): Promise<string[]> {
    return this.repository.listCategories();
  }

  async getMenuItem(menuItemId: string): Promise<MenuItem> {
    const item = await this.repository.findMenuItem(menuItemId);
    if (!item) throw new NotFoundError("Menu item", menuItemId);
    return item;
  }

  async createMenuItem(input: CreateMenuItemRequest): Promise<MenuItem> {
    const id = await this.repository.insertMenuItem(input);
    return this.getMenuItem(id);
  }

  async updateMenuItem(menuItemId: string, patch: UpdateMenuItemRequest): Promise<MenuItem> {
    const updated = await this.repository.updateMenuItem(menuItemId, patch);
    if (!updated) throw new NotFoundError("Menu item", menuItemId);
    return this.getMenuItem(menuItemId);
  }

  async listAssignmentsForMenuItem(menuItemId: string): Promise<OutletAssignment[]> {
    await this.getMenuItem(menuItemId);
    return this.repository.listAssignmentsForMenuItem(menuItemId);
  }

  // ---- Outlet assignments (HQ writes, outlet staff read their own) ------------------------------------------------------

  async listAssignments(outletId: string): Promise<OutletAssignment[]> {
    await this.outlets.require(outletId);
    return this.repository.listAssignmentsForOutlet(outletId);
  }

  /**
   * Assigns an item to an outlet, or updates the outlet's price override and
   * availability. A first assignment also opens the outlet's stock level for the
   * item, in the same transaction, so "assigned" always implies "has stock row".
   */
  assign(
    outletId: string,
    menuItemId: string,
    input: UpsertAssignmentRequest,
    actor: Actor,
  ): Promise<{ assignment: OutletAssignment; created: boolean }> {
    return this.db.transaction(async () => {
      await this.outlets.require(outletId);
      const item = await this.getMenuItem(menuItemId);
      const existing = await this.repository.findAssignment(outletId, menuItemId);
      if (!existing && !item.isActive) {
        throw new ConflictError("Inactive menu items cannot be assigned. Activate the item first.");
      }

      const { inserted } = await this.repository.upsertAssignment(outletId, menuItemId, input);
      if (inserted) {
        await this.inventory.initializeStock({
          outletId,
          menuItemId,
          quantity: input.openingStock ?? 0,
          actor,
        });
      }

      const assignment = await this.repository.findAssignment(outletId, menuItemId);
      if (!assignment) throw new Error("Assignment vanished inside its own transaction");
      return { assignment, created: inserted };
    });
  }

  async unassign(outletId: string, menuItemId: string): Promise<void> {
    const removed = await this.repository.deleteAssignment(outletId, menuItemId);
    if (!removed) throw new NotFoundError("Assignment");
  }

  // ---- Outlet menu (outlet staff and HQ) --------------------------------------------

  async outletMenu(outletId: string): Promise<OutletMenuItem[]> {
    await this.outlets.require(outletId);
    return this.repository.sellableMenu(outletId);
  }

  // ---- Public API for other modules -------------------------------------------------

  /** Items the outlet may sell right now, with their effective price. Missing ids are not sellable. */
  sellableItems(outletId: string, menuItemIds: readonly string[]): Promise<SellableItem[]> {
    return this.repository.sellableItems(outletId, menuItemIds);
  }
}
