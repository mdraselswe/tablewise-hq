import { z } from "zod";
import { Id, PageSize } from "./common.ts";

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

/** Rolling windows the audit trail can be read in, newest first. */
export const MOVEMENT_WINDOW_DAYS = [7, 30, 90, 365] as const;

export const ListMovementsQuery = z.object({
  menuItemId: Id.optional(),
  reason: StockReason.optional(),
  days: z.coerce
    .number()
    .int()
    .refine((days) => (MOVEMENT_WINDOW_DAYS as readonly number[]).includes(days), {
      message: `must be one of ${MOVEMENT_WINDOW_DAYS.join(", ")}`,
    })
    .default(30)
    .meta({ description: "Only movements from the last N days (7, 30, 90 or 365). Default 30." }),
  cursor: z
    .string()
    .regex(/^\d{1,19}$/, "must be a movement id")
    .optional()
    .meta({ description: "`nextCursor` of the previous page; omit for the newest page." }),
  pageSize: PageSize,
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
