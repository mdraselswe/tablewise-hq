import { z } from "zod";

/** Every entity id is a UUID, so ids can be generated anywhere (HQ, an offline POS, another service). */
export const Id = z.uuid();

/**
 * Money is always an integer number of minor units (poisha for BDT).
 * Integers keep sums exact; floats would drift (0.1 + 0.2 !== 0.3).
 */
export const MoneyMinor = z
  .number()
  .int()
  .min(0)
  .max(100_000_000)
  .meta({ description: "Amount in minor units (poisha). 12550 means BDT 125.50." });

/** A calendar date in the business time zone, e.g. 2026-11-24. */
export const IsoDate = z.iso.date();

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.output<typeof PaginationQuery>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const DateRangeShape = {
  from: IsoDate.optional(),
  to: IsoDate.optional(),
};

/** Rejects ranges where `from` is after `to`. Applied to every query that has a date range. */
export function isOrderedRange(range: { from?: string | undefined; to?: string | undefined }): boolean {
  return !range.from || !range.to || range.from <= range.to;
}

export const RANGE_ORDER_ISSUE = { message: "`from` must be on or before `to`", path: ["from"] };

export const OutletIdParams = z.object({ outletId: Id });
