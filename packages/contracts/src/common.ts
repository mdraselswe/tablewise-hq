import { z } from "zod";

/**
 * Every entity id is a UUID, so ids can be generated anywhere (HQ, an offline POS, another service).
 * Lowercased on the way in: PostgreSQL returns UUIDs in lowercase, and comparing an
 * uppercase id from a client with them in code would otherwise fail.
 */
export const Id = z.uuid().overwrite((value) => value.toLowerCase());

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

export const PageSize = z.coerce.number().int().min(1).max(100).default(20);

/**
 * Page-number pagination, for small tables only (the master menu). The page is
 * capped because OFFSET reads and discards every skipped row.
 */
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: PageSize,
});
export type PaginationQuery = z.output<typeof PaginationQuery>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Lists that use keyset pagination count matching rows up to this many ("1,000+"). */
export const COUNT_CAP = 1000;

/**
 * Keyset (cursor) pagination, for tables that grow without limit (sales, stock
 * movements). Each page continues after the last row of the previous one through
 * an index, so page 5,000 costs the same as page 1, and rows inserted meanwhile
 * never shift a page.
 */
export interface CursorPage<T> {
  items: T[];
  pageSize: number;
  /** Pass as `cursor` to get the next (older) page; null on the last page. */
  nextCursor: string | null;
  /** Matching rows, counted up to COUNT_CAP. */
  total: number;
  /** True when more than COUNT_CAP rows match, so `total` is a lower bound. */
  totalCapped: boolean;
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
