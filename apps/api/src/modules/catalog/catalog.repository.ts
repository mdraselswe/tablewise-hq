import type {
  CreateMenuItemRequest,
  ListMenuItemsQuery,
  MenuItem,
  OutletAssignment,
  OutletMenuItem,
  UpdateMenuItemRequest,
} from "@tablewise/contracts";
import type { Database } from "@/platform/db/database.ts";
import { buildSet, pageWindow, toIso } from "@/platform/db/sql.ts";

interface MenuItemRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  base_price_minor: number;
  is_active: boolean;
  assigned_outlet_count: number;
  created_at: Date;
  updated_at: Date;
}

interface AssignmentRow {
  outlet_id: string;
  menu_item_id: string;
  sku: string;
  name: string;
  category: string;
  base_price_minor: number;
  price_override_minor: number | null;
  effective_price_minor: number;
  is_available: boolean;
  menu_item_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface SellableRow {
  menu_item_id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  base_price_minor: number;
  price_override_minor: number | null;
  price_minor: number;
}

export interface SellableItem {
  menuItemId: string;
  sku: string;
  name: string;
  priceMinor: number;
}

const MENU_ITEM_COLUMNS = `
  mi.id, mi.sku, mi.name, mi.description, mi.category, mi.base_price_minor, mi.is_active,
  mi.created_at, mi.updated_at,
  (SELECT count(*) FROM catalog.outlet_menu_items omi WHERE omi.menu_item_id = mi.id)::int AS assigned_outlet_count`;

const ASSIGNMENT_SELECT = `
  SELECT omi.outlet_id, omi.menu_item_id, mi.sku, mi.name, mi.category, mi.base_price_minor,
         omi.price_override_minor,
         COALESCE(omi.price_override_minor, mi.base_price_minor) AS effective_price_minor,
         omi.is_available, mi.is_active AS menu_item_active, omi.created_at, omi.updated_at
    FROM catalog.outlet_menu_items omi
    JOIN catalog.menu_items mi ON mi.id = omi.menu_item_id`;

const SELLABLE_SELECT = `
  SELECT mi.id AS menu_item_id, mi.sku, mi.name, mi.description, mi.category, mi.base_price_minor,
         omi.price_override_minor,
         COALESCE(omi.price_override_minor, mi.base_price_minor) AS price_minor
    FROM catalog.outlet_menu_items omi
    JOIN catalog.menu_items mi ON mi.id = omi.menu_item_id
   WHERE omi.outlet_id = $1 AND omi.is_available AND mi.is_active`;

const toMenuItem = (row: MenuItemRow): MenuItem => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  description: row.description,
  category: row.category,
  basePriceMinor: row.base_price_minor,
  isActive: row.is_active,
  assignedOutletCount: row.assigned_outlet_count,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const toAssignment = (row: AssignmentRow): OutletAssignment => ({
  outletId: row.outlet_id,
  menuItemId: row.menu_item_id,
  sku: row.sku,
  name: row.name,
  category: row.category,
  basePriceMinor: row.base_price_minor,
  priceOverrideMinor: row.price_override_minor,
  effectivePriceMinor: row.effective_price_minor,
  isAvailable: row.is_available,
  menuItemActive: row.menu_item_active,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
const likePattern = (term: string): string => `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

export class CatalogRepository {
  constructor(private readonly db: Database) {}

  // ---- Master menu ------------------------------------------------------------------

  async listMenuItems(query: ListMenuItemsQuery): Promise<{ items: MenuItem[]; total: number }> {
    const filters = `
      WHERE ($1::text IS NULL OR (mi.name || ' ' || mi.sku) ILIKE $1)
        AND ($2::text IS NULL OR mi.category = $2)
        AND ($3::text = 'all' OR mi.is_active = ($3::text = 'active'))
        AND ($4::uuid IS NULL OR NOT EXISTS (
              SELECT 1 FROM catalog.outlet_menu_items omi
               WHERE omi.outlet_id = $4 AND omi.menu_item_id = mi.id))`;
    const params = [
      query.search ? likePattern(query.search) : null,
      query.category ?? null,
      query.status,
      query.notAssignedTo ?? null,
    ];
    const { limit, offset } = pageWindow(query.page, query.pageSize);

    const [rows, count] = await Promise.all([
      this.db.many<MenuItemRow>(
        `SELECT ${MENU_ITEM_COLUMNS} FROM catalog.menu_items mi ${filters}
          ORDER BY mi.category, mi.name, mi.id LIMIT $5 OFFSET $6`,
        [...params, limit, offset],
      ),
      this.db.one<{ total: number }>(
        `SELECT count(*)::int AS total FROM catalog.menu_items mi ${filters}`,
        params,
      ),
    ]);
    return { items: rows.map(toMenuItem), total: count?.total ?? 0 };
  }

  async listCategories(): Promise<string[]> {
    const rows = await this.db.many<{ category: string }>(
      "SELECT DISTINCT category FROM catalog.menu_items ORDER BY category",
    );
    return rows.map((row) => row.category);
  }

  async findMenuItem(id: string): Promise<MenuItem | undefined> {
    const row = await this.db.one<MenuItemRow>(
      `SELECT ${MENU_ITEM_COLUMNS} FROM catalog.menu_items mi WHERE mi.id = $1`,
      [id],
    );
    return row && toMenuItem(row);
  }

  async insertMenuItem(input: CreateMenuItemRequest): Promise<string> {
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO catalog.menu_items (sku, name, description, category, base_price_minor)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.sku, input.name, input.description ?? null, input.category, input.basePriceMinor],
    );
    if (!row) throw new Error("INSERT ... RETURNING returned no row");
    return row.id;
  }

  async updateMenuItem(id: string, patch: UpdateMenuItemRequest): Promise<boolean> {
    const { clause, values } = buildSet(
      patch,
      {
        name: "name",
        description: "description",
        category: "category",
        basePriceMinor: "base_price_minor",
        isActive: "is_active",
      },
      2,
    );
    const result = await this.db.query(`UPDATE catalog.menu_items SET ${clause} WHERE id = $1`, [
      id,
      ...values,
    ]);
    return result.rowCount === 1;
  }

  // ---- Outlet assignments -----------------------------------------------------------

  async listAssignmentsForOutlet(outletId: string): Promise<OutletAssignment[]> {
    const rows = await this.db.many<AssignmentRow>(
      `${ASSIGNMENT_SELECT} WHERE omi.outlet_id = $1 ORDER BY mi.category, mi.name`,
      [outletId],
    );
    return rows.map(toAssignment);
  }

  async listAssignmentsForMenuItem(menuItemId: string): Promise<OutletAssignment[]> {
    const rows = await this.db.many<AssignmentRow>(
      `${ASSIGNMENT_SELECT} WHERE omi.menu_item_id = $1 ORDER BY omi.created_at`,
      [menuItemId],
    );
    return rows.map(toAssignment);
  }

  async findAssignment(outletId: string, menuItemId: string): Promise<OutletAssignment | undefined> {
    const row = await this.db.one<AssignmentRow>(
      `${ASSIGNMENT_SELECT} WHERE omi.outlet_id = $1 AND omi.menu_item_id = $2`,
      [outletId, menuItemId],
    );
    return row && toAssignment(row);
  }

  /**
   * Creates or updates an assignment in one statement (no read-then-write race).
   * `priceOverrideMinor`: undefined keeps the current value, null clears it.
   */
  async upsertAssignment(
    outletId: string,
    menuItemId: string,
    change: { priceOverrideMinor?: number | null | undefined; isAvailable?: boolean | undefined },
  ): Promise<{ inserted: boolean }> {
    const row = await this.db.one<{ inserted: boolean }>(
      `INSERT INTO catalog.outlet_menu_items AS omi (outlet_id, menu_item_id, price_override_minor, is_available)
       VALUES ($1, $2, $3::integer, COALESCE($5::boolean, true))
       ON CONFLICT (outlet_id, menu_item_id) DO UPDATE SET
         price_override_minor = CASE WHEN $4::boolean THEN EXCLUDED.price_override_minor
                                     ELSE omi.price_override_minor END,
         is_available = COALESCE($5::boolean, omi.is_available)
       RETURNING (xmax = 0) AS inserted`,
      [
        outletId,
        menuItemId,
        change.priceOverrideMinor ?? null,
        change.priceOverrideMinor !== undefined,
        change.isAvailable ?? null,
      ],
    );
    return { inserted: row?.inserted ?? false };
  }

  async deleteAssignment(outletId: string, menuItemId: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM catalog.outlet_menu_items WHERE outlet_id = $1 AND menu_item_id = $2",
      [outletId, menuItemId],
    );
    return result.rowCount === 1;
  }

  // ---- What an outlet can sell ------------------------------------------------------

  async sellableMenu(outletId: string): Promise<OutletMenuItem[]> {
    const rows = await this.db.many<SellableRow>(`${SELLABLE_SELECT} ORDER BY mi.category, mi.name`, [
      outletId,
    ]);
    return rows.map((row) => ({
      menuItemId: row.menu_item_id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      category: row.category,
      priceMinor: row.price_minor,
      basePriceMinor: row.base_price_minor,
      hasPriceOverride: row.price_override_minor !== null,
    }));
  }

  async sellableItems(outletId: string, menuItemIds: readonly string[]): Promise<SellableItem[]> {
    const rows = await this.db.many<SellableRow>(`${SELLABLE_SELECT} AND mi.id = ANY($2::uuid[])`, [
      outletId,
      menuItemIds,
    ]);
    return rows.map((row) => ({
      menuItemId: row.menu_item_id,
      sku: row.sku,
      name: row.name,
      priceMinor: row.price_minor,
    }));
  }
}
