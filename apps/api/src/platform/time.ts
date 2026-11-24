const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" for the current day in a time zone ("en-CA" formats dates as ISO). */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive number of days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
}

/**
 * Fills a missing end of a trading-day range: `to` defaults to today in the business
 * time zone and `from` to `defaultDays` days before `to`.
 */
export function resolveRange(
  query: { from?: string | undefined; to?: string | undefined },
  defaultDays: number,
  timeZone: string,
): { from: string; to: string } {
  const to = query.to ?? todayIn(timeZone);
  const from = query.from ?? addDays(to, -(defaultDays - 1));
  return { from, to };
}
