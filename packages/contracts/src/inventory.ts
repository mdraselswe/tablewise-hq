import { z } from "zod";
import { Id, PaginationQuery } from "./common.ts";

export const StockReason = z.enum(["INITIAL", "SALE", "RESTOCK", "ADJUSTMENT", "WASTE"]);
export type StockReason = z.infer<typeof StockReason>;

/** Reasons a person may record by hand. SALE and INITIAL are written by the system. */
export const ManualStockReason = z.enum(["RESTOCK", "ADJUSTMENT", "WASTE"]);

export const AdjustStockRequest = z
  .object({
    delta: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((value) => value !== 0, "Delta cannot be zero"),
    reason: ManualStockReason,
    note: z.string().trim().max(280).optional(),
  })
  .refine((body) => body.reason !== "RESTOCK" || body.delta > 0, {
    message: "A restock must add stock",
    path: ["delta"],
  })
  .refine((body) => body.reason !== "WASTE" || body.delta < 0, {
    message: "Waste must remove stock",
    path: ["delta"],
  });
export type AdjustStockRequest = z.infer<typeof AdjustStockRequest>;

export const UpdateStockSettingsRequest = z.object({
  lowStockThreshold: z.number().int().min(0).max(100_000),
});
export type UpdateStockSettingsRequest = z.infer<typeof UpdateStockSettingsRequest>;

export const ListMovementsQuery = PaginationQuery.extend({
  menuItemId: Id.optional(),
  reason: StockReason.optional(),
});
export type ListMovementsQuery = z.output<typeof ListMovementsQuery>;

export interface StockLevel {
  outletId: string;
  menuItemId: string;
  onHand: number;
  lowStockThreshold: number;
  isLow: boolean;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  outletId: string;
  menuItemId: string;
  delta: number;
  balanceAfter: number;
  reason: StockReason;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}
