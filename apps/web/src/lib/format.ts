/**
 * Formatting in one place. Money arrives as integer minor units (poisha) and is
 * only turned into a decimal string for display.
 */
export const BUSINESS_TIMEZONE = "Asia/Dhaka";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyWhole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en-US");

/** 125050 -> "BDT 1,250.50" */
export function formatMoney(minor: number, options: { whole?: boolean; currency?: boolean } = {}): string {
  const value = minor / 100;
  const text = options.whole ? moneyWhole.format(value) : money.format(value);
  return options.currency === false ? text : `BDT ${text}`;
}

/** 125050000 -> "BDT 1.3M" for KPI tiles and chart axes. */
export function formatMoneyCompact(minor: number): string {
  const value = minor / 100;
  return value < 10_000 ? `BDT ${moneyWhole.format(value)}` : `BDT ${compact.format(value)}`;
}

/** A list total that the server counts only up to a cap: "1,000+" beyond it. */
export function formatTotal(total: number, capped: boolean): string {
  return capped ? `${formatCount(total)}+` : formatCount(total);
}

export function formatCount(value: number): string {
  return integer.format(value);
}

/** Parses "1,250.50" or "1250.5" into minor units; undefined when it is not a valid amount. */
export function parseMoney(input: string): number | undefined {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const [whole = "0", fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function minorToInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

const timeFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
const dateTimeFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });

export function formatTime(iso: string, timeZone = BUSINESS_TIMEZONE): string {
  return timeFormat(timeZone).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone = BUSINESS_TIMEZONE): string {
  return dateTimeFormat(timeZone).format(new Date(iso));
}

/** "2026-11-24" -> "24 Nov" (a business date has no time zone of its own). */
export function formatBusinessDate(date: string, options: { weekday?: boolean } = {}): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(options.weekday ? { weekday: "short" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Today's calendar date in the business time zone, as YYYY-MM-DD. */
export function businessToday(timeZone = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });

/** "just now", "3 min. ago", "2 hr. ago" */
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/** Minutes and seconds since `iso`, for kitchen timers: "4:07". */
export function formatElapsed(iso: string, now = Date.now()): string {
  const total = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const PAYMENT_LABELS = { CASH: "Cash", CARD: "Card", MOBILE_WALLET: "Wallet" } as const;

export const STOCK_REASON_LABELS = {
  INITIAL: "Opening stock",
  SALE: "Sale",
  RESTOCK: "Restock",
  ADJUSTMENT: "Count correction",
  WASTE: "Waste",
} as const;

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
