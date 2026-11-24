import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowUpRight, MapPin, Plus, Store } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { outletsQuery, revenueQuery } from "@/api/resources.ts";
import { Page } from "@/components/layout/page.tsx";
import { Badge, StatusDot } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, EmptyState, FlashOnChange, Skeleton } from "@/components/ui/misc.tsx";
import { rangeFor } from "@/lib/date-range.ts";
import { formatCount, formatMoney } from "@/lib/format.ts";
import { OutletDialog, type OutletDialogState } from "./outlet-dialog.tsx";

export default function OutletsPage() {
  const [params, setParams] = useSearchParams();
  const outlets = useQuery(outletsQuery);
  const today = useQuery(revenueQuery(rangeFor("today")));
  const week = useQuery(revenueQuery(rangeFor("7d")));
  const todayById = useMemo(
    () => new Map((today.data?.outlets ?? []).map((row) => [row.outletId, row])),
    [today.data],
  );
  const weekById = useMemo(
    () => new Map((week.data?.outlets ?? []).map((row) => [row.outletId, row])),
    [week.data],
  );

  // ?new=1 opens the create dialog (the command palette links to it).
  const dialog: OutletDialogState = params.get("new") === "1" ? { mode: "create" } : null;

  return (
    <Page
      title="Outlets"
      description="Every branch, its status and how it is trading today."
      actions={
        <Button onClick={() => setParams({ new: "1" })}>
          <Plus />
          New outlet
        </Button>
      }
    >
      {outlets.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : outlets.data?.length === 0 ? (
        <Card>
          <EmptyState icon={<Store />} title="No outlets yet">
            Create the first outlet, then assign menu items to it.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {outlets.data?.map((outlet, index) => {
            const day = todayById.get(outlet.id);
            const seven = weekById.get(outlet.id);
            return (
              <motion.div
                key={outlet.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  to={`/hq/outlets/${outlet.id}`}
                  className={cn(
                    "group block h-full rounded-xl bg-card p-5 shadow-(--shadow-card) transition-[box-shadow,translate] duration-(--motion-base) ease-(--ease-ui) hover:-translate-y-0.5 hover:shadow-(--shadow-overlay)",
                    !outlet.isActive && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{outlet.name}</h2>
                        <Badge tone="outline" className="font-mono">
                          {outlet.code}
                        </Badge>
                      </div>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" aria-hidden="true" />
                        {outlet.address ?? "No address"}
                      </p>
                    </div>
                    <ArrowUpRight
                      className="size-4 text-muted-foreground transition-transform duration-(--motion-fast) group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </div>
                  <dl className="mt-6 grid grid-cols-2 gap-4 border-t pt-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">Today</dt>
                      <dd className="num mt-0.5 text-lg font-semibold">
                        <FlashOnChange value={day?.revenueMinor}>
                          {day ? formatMoney(day.revenueMinor, { whole: true }) : "—"}
                        </FlashOnChange>
                      </dd>
                      <dd className="num text-xs text-muted-foreground">
                        {formatCount(day?.saleCount ?? 0)} sales
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Last 7 days</dt>
                      <dd className="num mt-0.5 text-lg font-semibold">
                        {seven ? formatMoney(seven.revenueMinor, { whole: true }) : "—"}
                      </dd>
                      <dd className="num text-xs text-muted-foreground">
                        avg {formatMoney(seven?.averageTicketMinor ?? 0, { whole: true })}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <StatusDot tone={outlet.isActive ? "success" : "neutral"}>
                      {outlet.isActive ? "Open" : "Closed"}
                    </StatusDot>
                    <span className="text-muted-foreground">{outlet.timezone}</span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
      <OutletDialog state={dialog} onClose={() => setParams({}, { replace: true })} />
    </Page>
  );
}
