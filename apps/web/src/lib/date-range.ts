import { addDays, businessToday } from "./format.ts";

export type RangePreset = "today" | "7d" | "14d" | "30d";

export const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
] as const satisfies readonly { value: RangePreset; label: string }[];

const DAYS: Record<RangePreset, number> = { today: 1, "7d": 7, "14d": 14, "30d": 30 };

/** Inclusive business-date range ending today, e.g. 7d = today and the six days before it. */
export function rangeFor(preset: RangePreset, today = businessToday()): { from: string; to: string } {
  return { from: addDays(today, -(DAYS[preset] - 1)), to: today };
}

export function isRangePreset(value: string | null): value is RangePreset {
  return value !== null && value in DAYS;
}
