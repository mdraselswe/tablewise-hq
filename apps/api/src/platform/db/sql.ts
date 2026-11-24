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

export const toIso = (value: Date): string => value.toISOString();
export const toIsoOrNull = (value: Date | null): string | null => (value ? value.toISOString() : null);
