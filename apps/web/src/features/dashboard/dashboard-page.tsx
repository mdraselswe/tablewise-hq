import type { OutletRevenue, OutletTopItems } from "@tablewise/contracts";
import { useQueries, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, PackageCheck, Radio, ReceiptText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import {
  assignmentsQuery,
  outletsQuery,
  revenueQuery,
  salesQuery,
  stockLevelsQuery,
  topItemsQuery,
  trendQuery,
} from "@/api/resources.ts";
import { RevenueChart } from "@/components/charts/revenue-chart.tsx";
import { Page } from "@/components/layout/page.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardHeader, EmptyState, FlashOnChange, Skeleton } from "@/components/ui/misc.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import { Select } from "@/components/ui/select.tsx";
import { useFreshIds } from "@/hooks/use-fresh-ids.ts";
import { useNow } from "@/hooks/use-now.ts";
import { isRangePreset, RANGE_OPTIONS, type RangePreset, rangeFor } from "@/lib/date-range.ts";
import {
  addDays,
  formatCount,
  formatMoney,
  formatMoneyCompact,
  formatRelative,
  PAYMENT_LABELS,
} from "@/lib/format.ts";

function Delta({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined) return null;
  if (previous === 0) return current > 0 ? <span className="text-xs text-muted-foreground">new</span> : null;
  const change = (current - previous) / previous;
  const up = change >= 0;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-0.5 text-xs font-medium",
        up ? "text-success" : "text-destructive",
      )}
    >
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(change * 100).toFixed(1)}%
    </span>
  );
}

function Kpi({
  label,
  value,
  current,
  previous,
  pending,
}: {
  label: string;
  value: string;
  current: number;
  previous: number | undefined;
  pending: boolean;
}) {
  return (
    <Card className="px-5 py-4">
      <div className="text-[0.8125rem] text-muted-foreground">{label}</div>
      {pending ? (
        <Skeleton className="mt-2 h-8 w-32" />
      ) : (
        <div className="mt-1.5 flex items-baseline gap-2.5">
          <span className="num text-[1.625rem] leading-none font-semibold tracking-tight">
            <FlashOnChange value={value}>{value}</FlashOnChange>
          </span>
          <Delta current={current} previous={previous} />
        </div>
      )}
      <div className="mt-2 text-xs text-muted-foreground">vs previous period</div>
    </Card>
  );
}

function OutletRevenueList({ outlets, total }: { outlets: OutletRevenue[]; total: number }) {
  const sorted = [...outlets].sort((a, b) => b.revenueMinor - a.revenueMinor);
  const max = Math.max(...sorted.map((outlet) => outlet.revenueMinor), 1);
  return (
    <ul className="grid gap-4 px-5 pb-5">
      {sorted.map((outlet, index) => (
        <li key={outlet.outletId}>
          <Link to={`/hq/outlets/${outlet.outletId}`} className="group grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="font-medium group-hover:underline">
                {outlet.outletName}{" "}
                <span className="text-xs font-normal text-muted-foreground">{outlet.outletCode}</span>
              </span>
              <span className="num font-semibold">{formatMoney(outlet.revenueMinor, { whole: true })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-chart-1"
                initial={{ width: 0 }}
                animate={{ width: `${(outlet.revenueMinor / max) * 100}%` }}
                transition={{ duration: 0.7, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="num flex justify-between text-xs text-muted-foreground">
              <span>
                {formatCount(outlet.saleCount)} sales · avg{" "}
                {formatMoney(outlet.averageTicketMinor, { whole: true })}
              </span>
              <span>{total > 0 ? `${((outlet.revenueMinor / total) * 100).toFixed(1)}% of total` : "—"}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TopItemsCard({ outlet }: { outlet: OutletTopItems }) {
  const max = Math.max(...outlet.items.map((item) => item.quantity), 1);
  return (
    <Card>
      <CardHeader
        title={outlet.outletName}
        description={`Top ${outlet.items.length || 5} by quantity`}
        action={<Badge tone="outline">{outlet.outletCode}</Badge>}
      />
      {outlet.items.length === 0 ? (
        <p className="px-5 pb-5 text-[0.8125rem] text-muted-foreground">No sales in this period.</p>
      ) : (
        <ol className="grid gap-3 px-5 pb-5">
          {outlet.items.map((item) => (
            <li
              key={item.menuItemId}
              className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-3 gap-y-1"
            >
              <span
                className={cn(
                  "num text-center text-xs font-semibold",
                  item.rank === 1 ? "text-gold" : "text-muted-foreground",
                )}
              >
                {item.rank}
              </span>
              <span className="truncate text-[0.8125rem] font-medium">{item.itemName}</span>
              <span className="num text-right text-[0.8125rem]">{formatCount(item.quantity)}</span>
              <span />
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-chart-2"
                  style={{ width: `${(item.quantity / max) * 100}%` }}
                />
              </div>
              <span className="num text-right text-xs text-muted-foreground">
                {formatMoneyCompact(item.revenueMinor)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function LiveFeed({
  outletId,
  outletNames,
}: {
  outletId: string | undefined;
  outletNames: Map<string, string>;
}) {
  const recent = useQuery(salesQuery({ outletId, page: 1, pageSize: 8 }));
  const fresh = useFreshIds(
    recent.data?.items.map((sale) => sale.id),
    outletId ?? "all",
  );
  const now = useNow(30_000);
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            Live sales <Radio className="size-3.5 text-success" aria-hidden="true" />
          </span>
        }
        description="Newest first, straight from the tills"
        action={
          <Link to="/hq/sales" className="text-xs font-medium text-primary hover:underline">
            All sales
          </Link>
        }
      />
      {recent.isPending ? (
        <div className="grid gap-2 px-5 pb-5">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : recent.data?.items.length === 0 ? (
        <EmptyState icon={<ReceiptText />} title="No sales yet" />
      ) : (
        <ul className="divide-y px-5 pb-2" aria-live="polite">
          <AnimatePresence initial={false}>
            {recent.data?.items.map((sale) => (
              <motion.li
                key={sale.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5",
                  fresh.has(sale.id) && "flash",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.8125rem] font-medium">
                    {outletNames.get(sale.outletId) ?? "Outlet"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{sale.receiptNo}</span> · {PAYMENT_LABELS[sale.paymentMethod]}{" "}
                    · {formatRelative(sale.occurredAt, now)}
                  </div>
                </div>
                <span className="num text-[0.8125rem] font-semibold">
                  {formatMoney(sale.totalMinor, { whole: true })}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

function LowStockCard({ outletIds, outletNames }: { outletIds: string[]; outletNames: Map<string, string> }) {
  const levels = useQueries({ queries: outletIds.map((id) => stockLevelsQuery(id)) });
  const names = useQueries({ queries: outletIds.map((id) => assignmentsQuery(id)) });
  const pending = levels.some((query) => query.isPending) || names.some((query) => query.isPending);
  const rows = useMemo(() => {
    const itemNames = new Map<string, string>();
    for (const query of names)
      for (const assignment of query.data ?? []) itemNames.set(assignment.menuItemId, assignment.name);
    return levels
      .flatMap((query) => query.data ?? [])
      .filter((level) => level.isLow)
      .sort((a, b) => a.onHand - b.onHand)
      .map((level) => ({ ...level, itemName: itemNames.get(level.menuItemId) ?? "Item" }));
  }, [levels, names]);

  return (
    <Card>
      <CardHeader
        title="Needs attention"
        description="Items at or below their alert level"
        action={rows.length ? <Badge tone="warning">{rows.length}</Badge> : null}
      />
      {pending ? (
        <div className="grid gap-2 px-5 pb-5">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<PackageCheck />} title="Every item is stocked" className="py-8" />
      ) : (
        <ul className="grid gap-1 px-3 pb-3">
          {rows.slice(0, 7).map((row) => (
            <li key={`${row.outletId}:${row.menuItemId}`}>
              <Link
                to={`/hq/outlets/${row.outletId}?tab=inventory`}
                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted"
              >
                <AlertTriangle
                  className={cn("size-4 shrink-0", row.onHand === 0 ? "text-destructive" : "text-warning")}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.8125rem] font-medium">{row.itemName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {outletNames.get(row.outletId)}
                  </div>
                </div>
                <span
                  className={cn("num text-[0.8125rem] font-semibold", row.onHand === 0 && "text-destructive")}
                >
                  <FlashOnChange value={row.onHand}>
                    {row.onHand === 0 ? "Out" : `${row.onHand} left`}
                  </FlashOnChange>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const preset: RangePreset = isRangePreset(params.get("range"))
    ? (params.get("range") as RangePreset)
    : "7d";
  const outletParam = params.get("outlet");
  const outletId = outletParam ?? undefined;

  const outlets = useQuery(outletsQuery);
  const outletNames = useMemo(
    () => new Map((outlets.data ?? []).map((outlet) => [outlet.id, outlet.name])),
    [outlets.data],
  );

  const range = rangeFor(preset);
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
  const previousRange = { from: addDays(range.from, -days), to: addDays(range.from, -1) };
  // A one-day chart says nothing: "Today" still charts the last two weeks for context.
  const trendRange = preset === "today" ? rangeFor("14d") : range;

  const revenue = useQuery(revenueQuery({ ...range, outletId }));
  const previous = useQuery(revenueQuery({ ...previousRange, outletId }));
  const trend = useQuery(trendQuery({ ...trendRange, outletId }));
  const top = useQuery(topItemsQuery({ ...range, outletId, limit: 5 }));

  const totals = revenue.data?.totals;
  const before = previous.data?.totals;
  const update = (key: string, value: string | undefined) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === undefined) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const visibleOutletIds = outletId ? [outletId] : (outlets.data ?? []).map((outlet) => outlet.id);

  return (
    <Page
      wide
      title="Overview"
      description="Revenue, best sellers and stock across every outlet, updated live."
      actions={
        <>
          <Select
            aria-label="Outlet"
            value={outletParam ?? "all"}
            onValueChange={(value) => update("outlet", value === "all" ? undefined : value)}
            options={[
              { value: "all", label: "All outlets" },
              ...(outlets.data ?? []).map((outlet) => ({
                value: outlet.id,
                label: outlet.name,
                hint: outlet.code,
              })),
            ]}
            className="w-48"
          />
          <Segmented
            aria-label="Date range"
            value={preset}
            onChange={(value) => update("range", value)}
            options={RANGE_OPTIONS}
          />
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Revenue"
          value={formatMoney(totals?.revenueMinor ?? 0, { whole: true })}
          current={totals?.revenueMinor ?? 0}
          previous={before?.revenueMinor}
          pending={revenue.isPending}
        />
        <Kpi
          label="Sales"
          value={formatCount(totals?.saleCount ?? 0)}
          current={totals?.saleCount ?? 0}
          previous={before?.saleCount}
          pending={revenue.isPending}
        />
        <Kpi
          label="Average ticket"
          value={formatMoney(totals?.averageTicketMinor ?? 0, { whole: true })}
          current={totals?.averageTicketMinor ?? 0}
          previous={before?.averageTicketMinor}
          pending={revenue.isPending}
        />
        <Kpi
          label="Items sold"
          value={formatCount(totals?.itemsSold ?? 0)}
          current={totals?.itemsSold ?? 0}
          previous={before?.itemsSold}
          pending={revenue.isPending}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Revenue trend"
            description={`Daily revenue, ${trend.data?.points.length ?? 0} days`}
          />
          <div className="px-3 pb-4">
            {trend.data ? <RevenueChart points={trend.data.points} /> : <Skeleton className="mx-2 h-60" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Revenue by outlet" description="Share of revenue in this period" />
          {revenue.data ? (
            <OutletRevenueList outlets={revenue.data.outlets} total={revenue.data.totals.revenueMinor} />
          ) : (
            <Skeleton className="mx-5 mb-5 h-56" />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="top-items-heading">
          <h2 id="top-items-heading" className="mb-3 text-[0.9375rem] font-semibold tracking-tight">
            Top 5 items per outlet
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {top.data
              ? top.data.outlets.map((outlet) => <TopItemsCard key={outlet.outletId} outlet={outlet} />)
              : Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-60 rounded-xl" />)}
          </div>
        </section>
        <div className="grid content-start gap-4 xl:pt-9">
          <LiveFeed outletId={outletId} outletNames={outletNames} />
          <LowStockCard outletIds={visibleOutletIds} outletNames={outletNames} />
        </div>
      </div>
    </Page>
  );
}
