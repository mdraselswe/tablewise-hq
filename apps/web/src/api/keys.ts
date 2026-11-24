/**
 * Query keys, one tree per backend module. Invalidating a prefix (for example
 * `keys.inventory.outlet(id)`) refreshes everything under it, which is how live
 * events from the server refresh exactly the screens they affect.
 */
export const keys = {
  session: ["session"] as const,
  outlets: {
    all: ["outlets"] as const,
    detail: (outletId: string) => ["outlets", outletId] as const,
  },
  catalog: {
    all: ["catalog"] as const,
    items: (query: object) => ["catalog", "items", query] as const,
    categories: ["catalog", "categories"] as const,
    assignments: (outletId: string) => ["catalog", "assignments", outletId] as const,
    itemAssignments: (menuItemId: string) => ["catalog", "item-assignments", menuItemId] as const,
    outletMenu: (outletId: string) => ["catalog", "menu", outletId] as const,
  },
  inventory: {
    outlet: (outletId: string) => ["inventory", outletId] as const,
    levels: (outletId: string) => ["inventory", outletId, "levels"] as const,
    movements: (outletId: string, query: object) => ["inventory", outletId, "movements", query] as const,
  },
  sales: {
    all: ["sales"] as const,
    list: (query: object) => ["sales", "list", query] as const,
    detail: (saleId: string) => ["sales", "detail", saleId] as const,
  },
  kitchen: {
    board: (outletId: string) => ["kitchen", outletId] as const,
  },
  reports: {
    all: ["reports"] as const,
    revenue: (query: object) => ["reports", "revenue", query] as const,
    topItems: (query: object) => ["reports", "top-items", query] as const,
    trend: (query: object) => ["reports", "trend", query] as const,
  },
};
