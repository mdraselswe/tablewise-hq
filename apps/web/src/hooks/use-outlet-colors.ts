import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { outletsQuery } from "@/api/resources.ts";

const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"] as const;
const FALLBACK = "var(--muted-foreground)";

/**
 * One colour per outlet, the same in every chart, dot and legend. Assigned in outlet-code
 * order so it does not change with sorting or filtering.
 */
export function useOutletColors(): (outletId: string) => string {
  const outlets = useQuery(outletsQuery);
  const colors = useMemo(() => {
    const ordered = [...(outlets.data ?? [])].sort((a, b) => a.code.localeCompare(b.code));
    return new Map(ordered.map((outlet, index) => [outlet.id, SERIES[index % SERIES.length] ?? FALLBACK]));
  }, [outlets.data]);
  return (outletId) => colors.get(outletId) ?? FALLBACK;
}
