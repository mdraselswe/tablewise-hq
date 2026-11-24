import { z } from "zod";
import { Id, MoneyMinor, PaginationQuery } from "./common.ts";

export const Sku = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,40}$/, "2 to 40 letters, digits or dashes");

export const CreateMenuItemRequest = z.object({
  sku: Sku,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().min(2).max(60),
  basePriceMinor: MoneyMinor,
});
export type CreateMenuItemRequest = z.infer<typeof CreateMenuItemRequest>;

export const UpdateMenuItemRequest = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).nullable(),
    category: z.string().trim().min(2).max(60),
    basePriceMinor: MoneyMinor,
    isActive: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");
export type UpdateMenuItemRequest = z.infer<typeof UpdateMenuItemRequest>;

export const MenuItemStatusFilter = z.enum(["active", "inactive", "all"]);

export const ListMenuItemsQuery = PaginationQuery.extend({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  status: MenuItemStatusFilter.default("all"),
});
export type ListMenuItemsQuery = z.output<typeof ListMenuItemsQuery>;

export const MenuItemParams = z.object({ menuItemId: Id });
export const AssignmentParams = z.object({ outletId: Id, menuItemId: Id });

export const UpsertAssignmentRequest = z.object({
  /** null clears the override so the outlet falls back to the base price. */
  priceOverrideMinor: MoneyMinor.nullable().optional(),
  isAvailable: z.boolean().optional(),
  /** Applied only when the item is first assigned to the outlet. */
  openingStock: z.number().int().min(0).max(100_000).optional(),
});
export type UpsertAssignmentRequest = z.infer<typeof UpsertAssignmentRequest>;

export interface MenuItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  basePriceMinor: number;
  isActive: boolean;
  assignedOutletCount: number;
  createdAt: string;
  updatedAt: string;
}

/** HQ view of one item assigned to one outlet. */
export interface OutletAssignment {
  outletId: string;
  menuItemId: string;
  sku: string;
  name: string;
  category: string;
  basePriceMinor: number;
  priceOverrideMinor: number | null;
  effectivePriceMinor: number;
  isAvailable: boolean;
  menuItemActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What an outlet can sell right now: assigned, available and active, with the effective price. */
export interface OutletMenuItem {
  menuItemId: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  priceMinor: number;
  basePriceMinor: number;
  hasPriceOverride: boolean;
}
