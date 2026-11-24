import { z } from "zod";
import { DateRangeShape, Id, isOrderedRange, PaginationQuery, RANGE_ORDER_ISSUE } from "./common.ts";

/** Header carrying a client-generated UUID. Retrying with the same key never creates a second sale. */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

export const PaymentMethod = z.enum(["CASH", "CARD", "MOBILE_WALLET"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const CreateSaleRequest = z.object({
  lines: z
    .array(
      z.object({
        menuItemId: Id,
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1, "A sale needs at least one item")
    .max(100),
  paymentMethod: PaymentMethod,
  occurredAt: z.iso.datetime({ offset: true }).optional().meta({
    description:
      "When the sale happened at the till. Set by offline terminals that sync later; defaults to now. Accepted up to 72 hours in the past.",
  }),
});
export type CreateSaleRequest = z.infer<typeof CreateSaleRequest>;

export const IdempotencyKey = z.uuid({ message: `${IDEMPOTENCY_KEY_HEADER} must be a UUID` }).optional();

export const ListSalesQuery = PaginationQuery.extend({
  ...DateRangeShape,
  outletId: Id.optional(),
}).refine(isOrderedRange, RANGE_ORDER_ISSUE);
export type ListSalesQuery = z.output<typeof ListSalesQuery>;

export const SaleParams = z.object({ saleId: Id });

export interface SaleLine {
  lineNo: number;
  menuItemId: string;
  sku: string;
  itemName: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
}

export interface SaleSummary {
  id: string;
  outletId: string;
  receiptNo: string;
  receiptSeq: number;
  paymentMethod: PaymentMethod;
  totalMinor: number;
  itemCount: number;
  cashierId: string | null;
  cashierName: string | null;
  businessDate: string;
  occurredAt: string;
  createdAt: string;
}

export interface Sale extends SaleSummary {
  lines: SaleLine[];
}
