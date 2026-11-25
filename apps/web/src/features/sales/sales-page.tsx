import type { Outlet, SaleSummary } from "@tablewise/contracts";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { outletsQuery, saleQuery, salesQuery } from "@/api/resources.ts";
import { Page } from "@/components/layout/page.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, EmptyState, Skeleton } from "@/components/ui/misc.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import { Select } from "@/components/ui/select.tsx";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table.tsx";
import { isHq, useSessionUser } from "@/features/auth/session.ts";
import { useCursorPager } from "@/hooks/use-cursor-pager.ts";
import { useFreshIds } from "@/hooks/use-fresh-ids.ts";
import { useOutletColors } from "@/hooks/use-outlet-colors.ts";
import { isRangePreset, RANGE_OPTIONS, type RangePreset, rangeFor } from "@/lib/date-range.ts";
import {
  formatBusinessDate,
  formatDateTime,
  formatMoney,
  formatTime,
  formatTotal,
  PAYMENT_LABELS,
} from "@/lib/format.ts";
import { Receipt } from "./receipt.tsx";

const PAGE_SIZE = 25;

function SaleSheet({
  saleId,
  outlet,
  onClose,
}: {
  saleId: string | null;
  outlet: Outlet | undefined;
  onClose: () => void;
}) {
  const sale = useQuery({ ...saleQuery(saleId ?? ""), enabled: saleId !== null });
  return (
    <Sheet open={saleId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{sale.data?.receiptNo ?? "Receipt"}</SheetTitle>
          <SheetDescription>
            {sale.data ? `Business day ${sale.data.businessDate}${outlet ? ` · ${outlet.name}` : ""}` : " "}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {sale.data ? (
            <div className="grid gap-5">
              <Receipt sale={sale.data} {...(outlet ? { outletName: outlet.name } : {})} />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.8125rem]">
                <dt className="text-muted-foreground">Receipt sequence</dt>
                <dd className="num text-right font-medium">#{sale.data.receiptSeq}</dd>
                <dt className="text-muted-foreground">Rung up at</dt>
                <dd className="text-right">{formatDateTime(sale.data.occurredAt, outlet?.timezone)}</dd>
                <dt className="text-muted-foreground">Recorded at</dt>
                <dd className="text-right">{formatDateTime(sale.data.createdAt, outlet?.timezone)}</dd>
                <dt className="text-muted-foreground">Sale id</dt>
                <dd className="truncate text-right font-mono text-xs">{sale.data.id}</dd>
              </dl>
            </div>
          ) : (
            <Skeleton className="h-80 rounded-lg" />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Below 1024px the page is a list grouped by business day: seven columns do not fit without
 * sideways scrolling, and on the go people scan by day, receipt and total.
 */
function SaleList({
  sales,
  hq,
  outletById,
  fresh,
  onOpen,
}: {
  sales: SaleSummary[];
  hq: boolean;
  outletById: Map<string, Outlet>;
  fresh: ReadonlySet<string>;
  onOpen: (sale: SaleSummary) => void;
}) {
  const colorOf = useOutletColors();
  const days = useMemo(() => {
    const groups: { date: string; sales: SaleSummary[] }[] = [];
    for (const sale of sales) {
      const last = groups.at(-1);
      if (last?.date === sale.businessDate) last.sales.push(sale);
      else groups.push({ date: sale.businessDate, sales: [sale] });
    }
    return groups;
  }, [sales]);

  return (
    <div className="lg:hidden">
      {days.map((day) => (
        <section key={day.date} aria-label={formatBusinessDate(day.date, { weekday: true })}>
          <h3 className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
            {/* No day total here: a page can hold only part of a day, so it would mislead. */}
            {formatBusinessDate(day.date, { weekday: true })}
          </h3>
          <ul className="divide-y divide-border/70">
            {day.sales.map((sale) => {
              const outlet = outletById.get(sale.outletId);
              return (
                <li key={sale.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(sale)}
                    className={cn(
                      "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none focus-visible:bg-muted/60 active:bg-muted",
                      fresh.has(sale.id) && "flash",
                    )}
                  >
                    {hq ? (
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: colorOf(sale.outletId) }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[0.8125rem] font-medium">{sale.receiptNo}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatTime(sale.occurredAt, outlet?.timezone)}
                        {hq && outlet ? ` · ${outlet.name}` : ""} · {PAYMENT_LABELS[sale.paymentMethod]} ·{" "}
                        {sale.itemCount} {sale.itemCount === 1 ? "item" : "items"}
                      </div>
                    </div>
                    <span className="num shrink-0 text-sm font-semibold">
                      {formatMoney(sale.totalMinor, { currency: false })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Sales history. HQ sees every outlet (with a filter); outlet staff see their own. */
export default function SalesPage() {
  const user = useSessionUser();
  const hq = isHq(user);
  const [params, setParams] = useSearchParams();
  const preset: RangePreset = isRangePreset(params.get("range"))
    ? (params.get("range") as RangePreset)
    : "7d";
  const outletFilter = params.get("outlet") ?? "all";
  const pager = useCursorPager(`${preset}|${outletFilter}`);
  const [openSale, setOpenSale] = useState<SaleSummary | null>(null);
  const colorOf = useOutletColors();

  const outlets = useQuery(outletsQuery);
  const outletById = useMemo(
    () => new Map((outlets.data ?? []).map((outlet) => [outlet.id, outlet])),
    [outlets.data],
  );
  const range = rangeFor(preset);
  const sales = useQuery(
    salesQuery({
      ...range,
      outletId: hq && outletFilter !== "all" ? outletFilter : undefined,
      cursor: pager.cursor,
      pageSize: PAGE_SIZE,
    }),
  );

  // Rows that arrive over the live stream after the first load get a one-time highlight.
  const fresh = useFreshIds(
    sales.data?.items.map((sale) => sale.id),
    `${preset}|${outletFilter}|${pager.cursor ?? "newest"}`,
  );

  const update = (changes: Record<string, string | undefined>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  const firstRow = (pager.pageNumber - 1) * PAGE_SIZE + 1;
  const lastRow = firstRow + (sales.data?.items.length ?? 0) - 1;
  const pageTotal = (sales.data?.items ?? []).reduce((sum, sale) => sum + sale.totalMinor, 0);

  return (
    <Page
      title={hq ? "Sales" : "Sales history"}
      description="Every completed sale with its receipt. New sales appear as they happen."
      actions={
        <>
          {hq ? (
            <Select
              aria-label="Outlet"
              value={outletFilter}
              onValueChange={(value) => update({ outlet: value === "all" ? undefined : value })}
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
          ) : null}
          <Segmented
            aria-label="Date range"
            value={preset}
            onChange={(value) => update({ range: value })}
            options={RANGE_OPTIONS}
          />
        </>
      }
    >
      <Card className="overflow-clip">
        {sales.isPending ? (
          <div className="grid gap-2 p-5">
            {Array.from({ length: 10 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : sales.data?.items.length === 0 ? (
          <EmptyState icon={<ReceiptText />} title="No sales in this period">
            Sales rung up at the counter show here instantly.
          </EmptyState>
        ) : (
          <>
            <SaleList
              sales={sales.data?.items ?? []}
              hq={hq}
              outletById={outletById}
              fresh={fresh}
              onOpen={setOpenSale}
            />
            <Table stickyHeader className="hidden lg:table">
              <THead>
                <TR>
                  <TH>Receipt</TH>
                  {hq ? <TH>Outlet</TH> : null}
                  <TH>Time</TH>
                  <TH>Cashier</TH>
                  <TH>Payment</TH>
                  <TH numeric>Items</TH>
                  <TH numeric>Total</TH>
                </TR>
              </THead>
              <TBody className={cn(sales.isPlaceholderData && "opacity-60 transition-opacity")}>
                {sales.data?.items.map((sale) => {
                  const outlet = outletById.get(sale.outletId);
                  return (
                    <TR
                      key={sale.id}
                      data-clickable="true"
                      tabIndex={0}
                      onClick={() => setOpenSale(sale)}
                      onKeyDown={(event) => event.key === "Enter" && setOpenSale(sale)}
                      className={cn(fresh.has(sale.id) && "flash", "outline-none focus-visible:bg-muted/60")}
                    >
                      <TD className="font-mono text-[0.8125rem] font-medium">{sale.receiptNo}</TD>
                      {hq ? (
                        <TD>
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ background: colorOf(sale.outletId) }}
                              aria-hidden="true"
                            />
                            {outlet?.name ?? "—"}
                          </span>
                        </TD>
                      ) : null}
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(sale.occurredAt, outlet?.timezone)}
                      </TD>
                      <TD className="text-muted-foreground">{sale.cashierName ?? "—"}</TD>
                      <TD>
                        <Badge tone="outline">{PAYMENT_LABELS[sale.paymentMethod]}</Badge>
                      </TD>
                      <TD numeric>{sale.itemCount}</TD>
                      <TD numeric className="font-medium">
                        {formatMoney(sale.totalMinor, { currency: false })}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
              <span className="num">
                {firstRow}–{lastRow} of{" "}
                {formatTotal(sales.data?.total ?? 0, sales.data?.totalCapped ?? false)} sales · this page{" "}
                {formatMoney(pageTotal)}
              </span>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1 sm:h-8 sm:flex-none"
                  disabled={!pager.hasPrevious}
                  onClick={pager.previous}
                >
                  Newer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1 sm:h-8 sm:flex-none"
                  disabled={!sales.data?.nextCursor}
                  onClick={() => {
                    if (sales.data?.nextCursor) pager.next(sales.data.nextCursor);
                  }}
                >
                  Older
                </Button>
              </div>
            </footer>
          </>
        )}
      </Card>
      <SaleSheet
        saleId={openSale?.id ?? null}
        outlet={openSale ? outletById.get(openSale.outletId) : undefined}
        onClose={() => setOpenSale(null)}
      />
    </Page>
  );
}
