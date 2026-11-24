import type { Database } from "./database.ts";

/**
 * Builds the SET clause of a partial UPDATE from a validated patch object.
 * Column names come from a fixed whitelist, never from the request; values are
 * always bound parameters.
 */
export function buildSet<T extends object>(
  patch: T,
  columns: { [K in keyof T]?: string },
  firstIndex: number,
): { clause: string; values: unknown[] } {
  const parts: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const column = columns[key];
    const value = patch[key];
    if (!column || value === undefined) continue;
    values.push(value);
    parts.push(`${column} = $${firstIndex + values.length - 1}`);
  }
  return { clause: parts.join(", "), values };
}

/** Builds `LIMIT/OFFSET` parameters for 1-based pages. */
export function pageWindow(page: number, pageSize: number): { limit: number; offset: number } {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

/**
 * Counts matching rows but stops at `cap + 1`, so the cost of a list's total is
 * bounded however large the table grows. `fromAndWhere` must be trusted SQL text.
 */
export async function cappedCount(
  db: Database,
  fromAndWhere: string,
  params: readonly unknown[],
  cap: number,
): Promise<{ total: number; totalCapped: boolean }> {
  const row = await db.one<{ total: number }>(
    `SELECT count(*)::int AS total FROM (SELECT 1 ${fromAndWhere} LIMIT ${cap + 1}) AS capped`,
    params,
  );
  const total = row?.total ?? 0;
  return { total: Math.min(total, cap), totalCapped: total > cap };
}

/** Splits a page fetched with LIMIT pageSize + 1 into the page and the next cursor. */
export function keysetPage<T>(
  rows: T[],
  pageSize: number,
  cursorOf: (row: T) => string,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, pageSize);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > pageSize && last ? cursorOf(last) : null };
}

export const toIso = (value: Date): string => value.toISOString();
export const toIsoOrNull = (value: Date | null): string | null => (value ? value.toISOString() : null);
