import { MOVEMENT_WINDOW_DAYS, type StockLevel, type StockReason } from "@tablewise/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  History,
  PackagePlus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useMemo, useState } from "react";
import { keys } from "@/api/keys.ts";
import { assignmentsQuery, inventoryApi, movementsQuery, stockLevelsQuery } from "@/api/resources.ts";
import { Badge, StatusDot } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardHeader, EmptyState, FlashOnChange, Skeleton, Tooltip } from "@/components/ui/misc.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import { Select } from "@/components/ui/select.tsx";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table.tsx";
import { useCursorPager } from "@/hooks/use-cursor-pager.ts";
import { formatDateTime, formatTotal, STOCK_REASON_LABELS } from "@/lib/format.ts";
import { type AdjustMode, AdjustStockDialog, type AdjustTarget } from "./adjust-dialog.tsx";

interface Row {
  level: StockLevel;
  name: string;
  sku: string;
  category: string;
  available: boolean;
}

type Filter = "all" | "low" | "out";
type MovementWindow = (typeof MOVEMENT_WINDOW_DAYS)[number];

const PAGE_SIZE = 15;

function stockState(level: StockLevel): { tone: "success" | "warning" | "danger"; label: string } {
  if (level.onHand === 0) return { tone: "danger", label: "Out of stock" };
  if (level.isLow) return { tone: "warning", label: "Low" };
  return { tone: "success", label: "In stock" };
}

/** Inline editor for the low-stock alert level. Saves on blur or Enter. */
function ThresholdInput({ level, className }: { level: StockLevel; className?: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(level.lowStockThreshold));
  const save = useMutation({
    mutationFn: (threshold: number) => inventoryApi.setThreshold(level.outletId, level.menuItemId, threshold),
    onSuccess: (updated) =>
      queryClient.setQueryData<StockLevel[]>(keys.inventory.levels(level.outletId), (levels) =>
        levels?.map((candidate) => (candidate.menuItemId === updated.menuItemId ? updated : candidate)),
      ),
    onError: () => setValue(String(level.lowStockThreshold)),
  });
  const commit = () => {
    const next = Number.parseInt(value, 10);
    if (Number.isNaN(next) || next < 0) return setValue(String(level.lowStockThreshold));
    if (next !== level.lowStockThreshold) save.mutate(next);
  };
  return (
    <Input
      type="number"
      min={0}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      aria-label="Low-stock alert level"
      className={cn("h-7 w-16 px-2 text-right text-[0.8125rem]", className)}
    />
  );
}

function StockBar({ level }: { level: StockLevel }) {
  // Full bar at four times the alert level, so "low" is the first quarter.
  const scale = Math.max(level.lowStockThreshold * 4, 1);
  const width = Math.min(100, (level.onHand / scale) * 100);
  const state = stockState(level);
  return (
    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-(--motion-slow) ease-(--ease-ui)",
          state.tone === "danger"
            ? "bg-destructive"
            : state.tone === "warning"
              ? "bg-warning"
              : "bg-success/70",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/**
 * Phones and tablets: name and count only, tap a row for the details and actions. Seven columns
 * would need sideways scrolling, and the count is what people check on the floor.
 */
function StockList({ rows, onOpen }: { rows: Row[]; onOpen: (row: Row, mode: AdjustMode) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-border/70 border-t lg:hidden">
      {rows.map((row) => {
        const id = row.level.menuItemId;
        const state = stockState(row.level);
        const isOpen = expanded === id;
        return (
          <li key={id}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`stock-${id}`}
              onClick={() => setExpanded(isOpen ? null : id)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none focus-visible:bg-muted/60 active:bg-muted"
            >
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-medium">{row.name}</span>
                <span className="text-xs text-muted-foreground">
                  <StatusDot tone={state.tone}>{state.label}</StatusDot>
                </span>
              </div>
              <span
                className={cn(
                  "num shrink-0 text-lg font-semibold",
                  row.level.onHand === 0 && "text-destructive",
                )}
              >
                <FlashOnChange value={row.level.onHand}>{row.level.onHand}</FlashOnChange>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-base) ease-(--ease-ui)",
                  isOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  id={`stock-${id}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-3 px-4 pb-4">
                    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 rounded-lg bg-muted/50 p-3 text-[0.8125rem]">
                      <dt className="text-muted-foreground">SKU</dt>
                      <dd className="truncate text-right font-mono text-xs">{row.sku || "—"}</dd>
                      <dt className="text-muted-foreground">Category</dt>
                      <dd className="truncate text-right">{row.category || "—"}</dd>
                      <dt className="text-muted-foreground">Level</dt>
                      <dd className="flex justify-end">
                        <StockBar level={row.level} />
                      </dd>
                      <dt className="text-muted-foreground">Alert below</dt>
                      <dd className="flex justify-end">
                        <ThresholdInput
                          key={row.level.lowStockThreshold}
                          level={row.level}
                          className="h-9 w-20"
                        />
                      </dd>
                    </dl>
                    {!row.available ? (
                      <p className="text-xs text-muted-foreground">Not on sale at the counter right now.</p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <Button className="h-11" onClick={() => onOpen(row, "RESTOCK")}>
                        <PackagePlus />
                        Restock
                      </Button>
                      <Button variant="outline" className="h-11" onClick={() => onOpen(row, "ADJUSTMENT")}>
                        <SlidersHorizontal />
                        Count or waste
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

const REASON_TONE: Record<StockReason, "neutral" | "primary" | "info" | "warning" | "danger"> = {
  INITIAL: "neutral",
  SALE: "info",
  RESTOCK: "primary",
  ADJUSTMENT: "warning",
  WASTE: "danger",
};

function MovementsCard({
  outletId,
  rows,
  timeZone,
}: {
  outletId: string;
  rows: Map<string, Row>;
  timeZone: string;
}) {
  const [menuItemId, setMenuItemId] = useState<string>("all");
  const [reason, setReason] = useState<StockReason | "all">("all");
  const [days, setDays] = useState<MovementWindow>(30);
  const pager = useCursorPager(`${menuItemId}|${reason}|${days}`);
  const movements = useQuery(
    movementsQuery(outletId, {
      menuItemId: menuItemId === "all" ? undefined : menuItemId,
      reason: reason === "all" ? undefined : reason,
      days,
      cursor: pager.cursor,
      pageSize: PAGE_SIZE,
    }),
  );
  const itemOptions = useMemo(
    () => [
      { value: "all", label: "All items" },
      ...[...rows.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => ({ value: row.level.menuItemId, label: row.name })),
    ],
    [rows],
  );
  const firstRow = (pager.pageNumber - 1) * PAGE_SIZE + 1;
  const lastRow = firstRow + (movements.data?.items.length ?? 0) - 1;

  return (
    <Card>
      <CardHeader
        title="Audit trail"
        description="Every change to stock: who, when, why, and the balance after."
        action={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Select
              aria-label="Item"
              size="sm"
              value={menuItemId}
              onValueChange={setMenuItemId}
              options={itemOptions}
              className="col-span-2 w-full sm:w-44"
            />
            <Select
              aria-label="Reason"
              size="sm"
              value={reason}
              onValueChange={setReason}
              options={[
                { value: "all", label: "All reasons" },
                ...Object.entries(STOCK_REASON_LABELS).map(([value, label]) => ({
                  value: value as StockReason,
                  label,
                })),
              ]}
              className="w-full sm:w-40"
            />
            <Select
              aria-label="Period"
              size="sm"
              value={String(days)}
              onValueChange={(value) => setDays(Number(value) as MovementWindow)}
              options={MOVEMENT_WINDOW_DAYS.map((value) => ({
                value: String(value),
                label: value === 365 ? "Last year" : `Last ${value} days`,
              }))}
              className="w-full sm:w-36"
            />
          </div>
        }
      />
      {movements.isPending ? (
        <div className="grid gap-2 px-5 pb-5">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : movements.data?.items.length === 0 ? (
        <EmptyState icon={<History />} title="No stock changes match">
          {days < 365 ? "Try a longer period." : null}
        </EmptyState>
      ) : (
        <>
          <ul
            className={cn(
              "divide-y divide-border/70 border-t lg:hidden",
              movements.isPlaceholderData && "opacity-60 transition-opacity",
            )}
          >
            {movements.data?.items.map((movement) => (
              <li key={movement.id} className="grid grid-cols-[minmax(0,1fr)] gap-1.5 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {rows.get(movement.menuItemId)?.name ?? "Removed item"}
                  </span>
                  <span
                    className={cn(
                      "num shrink-0 text-sm font-semibold",
                      movement.delta > 0 ? "text-success" : "text-foreground",
                    )}
                  >
                    {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge tone={REASON_TONE[movement.reason]}>{STOCK_REASON_LABELS[movement.reason]}</Badge>
                    <span className="truncate">
                      {movement.actorName ?? (movement.reason === "SALE" ? "Till" : "System")} ·{" "}
                      {formatDateTime(movement.createdAt, timeZone)}
                    </span>
                  </span>
                  <span className="num shrink-0">Bal. {movement.balanceAfter}</span>
                </div>
                {movement.note ? (
                  <p className="truncate text-xs text-muted-foreground">{movement.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <Table stickyHeader className="hidden lg:table">
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Item</TH>
                <TH>Reason</TH>
                <TH numeric>Change</TH>
                <TH numeric>Balance</TH>
                <TH>By</TH>
                <TH>Note</TH>
              </TR>
            </THead>
            <TBody className={cn(movements.isPlaceholderData && "opacity-60 transition-opacity")}>
              {movements.data?.items.map((movement) => (
                <TR key={movement.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(movement.createdAt, timeZone)}
                  </TD>
                  <TD className="font-medium">{rows.get(movement.menuItemId)?.name ?? "Removed item"}</TD>
                  <TD>
                    <Badge tone={REASON_TONE[movement.reason]}>{STOCK_REASON_LABELS[movement.reason]}</Badge>
                  </TD>
                  <TD
                    numeric
                    className={cn("font-medium", movement.delta > 0 ? "text-success" : "text-foreground")}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {movement.delta > 0 ? (
                        <ArrowUpRight className="size-3" />
                      ) : (
                        <ArrowDownRight className="size-3 text-muted-foreground" />
                      )}
                      {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                    </span>
                  </TD>
                  <TD numeric>{movement.balanceAfter}</TD>
                  <TD className="text-muted-foreground">
                    {movement.actorName ?? (movement.reason === "SALE" ? "Till" : "System")}
                  </TD>
                  <TD className="max-w-56 truncate text-muted-foreground">{movement.note ?? ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
            <span className="num">
              {firstRow}–{lastRow} of{" "}
              {formatTotal(movements.data?.total ?? 0, movements.data?.totalCapped ?? false)} changes
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
                disabled={!movements.data?.nextCursor}
                onClick={() => {
                  if (movements.data?.nextCursor) pager.next(movements.data.nextCursor);
                }}
              >
                Older
              </Button>
            </div>
          </footer>
        </>
      )}
    </Card>
  );
}

/**
 * Stock levels for one outlet with restock / count / waste actions and the audit
 * trail. Used by outlet staff (their outlet) and by HQ (any outlet).
 */
export function InventoryPanel({
  outletId,
  timeZone = "Asia/Dhaka",
}: {
  outletId: string;
  timeZone?: string;
}) {
  const levels = useQuery(stockLevelsQuery(outletId));
  const assignments = useQuery(assignmentsQuery(outletId));
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [target, setTarget] = useState<AdjustTarget | null>(null);

  const rows = useMemo(() => {
    const names = new Map((assignments.data ?? []).map((assignment) => [assignment.menuItemId, assignment]));
    const map = new Map<string, Row>();
    for (const level of levels.data ?? []) {
      const assignment = names.get(level.menuItemId);
      map.set(level.menuItemId, {
        level,
        name: assignment?.name ?? "Unknown item",
        sku: assignment?.sku ?? "",
        category: assignment?.category ?? "",
        available: assignment ? assignment.isAvailable && assignment.menuItemActive : false,
      });
    }
    return map;
  }, [levels.data, assignments.data]);

  const counts = useMemo(() => {
    let low = 0;
    let out = 0;
    for (const row of rows.values()) {
      if (row.level.onHand === 0) out++;
      else if (row.level.isLow) low++;
    }
    return { low, out };
  }, [rows]);

  const visible = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return [...rows.values()]
      .filter((row) =>
        filter === "low"
          ? row.level.isLow && row.level.onHand > 0
          : filter === "out"
            ? row.level.onHand === 0
            : true,
      )
      .filter((row) => !term || row.name.toLowerCase().includes(term) || row.sku.toLowerCase().includes(term))
      .sort((a, b) => Number(b.level.isLow) - Number(a.level.isLow) || a.name.localeCompare(b.name));
  }, [rows, filter, deferredSearch]);

  const open = (row: Row, mode: AdjustMode) => setTarget({ level: row.level, itemName: row.name, mode });

  return (
    <div className="grid gap-(--page-gap)">
      <Card>
        <CardHeader
          title="Stock on hand"
          description="Sales deduct stock automatically. It can never go below zero."
          action={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative min-w-40 flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search"
                  aria-label="Search stock"
                  className="h-(--control-h-sm) w-full pl-8 sm:w-44"
                />
              </div>
              <Segmented
                aria-label="Filter stock"
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `All ${rows.size}` },
                  { value: "low", label: `Low ${counts.low}` },
                  { value: "out", label: `Out ${counts.out}` },
                ]}
              />
            </div>
          }
        />
        {levels.isPending || assignments.isPending ? (
          <div className="grid gap-2 px-5 pb-5">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<PackagePlus />}
            title={rows.size === 0 ? "No items assigned yet" : "Nothing matches"}
          >
            {rows.size === 0
              ? "Items get a stock level when HQ assigns them to this outlet."
              : "Try another filter."}
          </EmptyState>
        ) : (
          <>
            <StockList rows={visible} onOpen={open} />
            <Table stickyHeader className="hidden lg:table">
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH>Category</TH>
                  <TH numeric>On hand</TH>
                  <TH>Level</TH>
                  <TH>Status</TH>
                  <TH numeric>Alert below</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((row) => {
                  const state = stockState(row.level);
                  return (
                    <TR key={row.level.menuItemId}>
                      <TD>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-[0.6875rem] text-muted-foreground">
                          {row.sku}
                          {!row.available ? " · not on sale" : ""}
                        </div>
                      </TD>
                      <TD className="text-muted-foreground">{row.category}</TD>
                      <TD numeric className="text-[0.9375rem] font-semibold">
                        <FlashOnChange value={row.level.onHand}>{row.level.onHand}</FlashOnChange>
                      </TD>
                      <TD>
                        <StockBar level={row.level} />
                      </TD>
                      <TD>
                        <StatusDot tone={state.tone}>{state.label}</StatusDot>
                      </TD>
                      <TD numeric>
                        <div className="flex justify-end">
                          <ThresholdInput key={row.level.lowStockThreshold} level={row.level} />
                        </div>
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => open(row, "RESTOCK")}>
                            <PackagePlus />
                            Restock
                          </Button>
                          <Tooltip content="Count or write off">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => open(row, "ADJUSTMENT")}
                              aria-label={`Adjust ${row.name}`}
                            >
                              <SlidersHorizontal />
                            </Button>
                          </Tooltip>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </>
        )}
      </Card>

      <MovementsCard outletId={outletId} rows={rows} timeZone={timeZone} />
      <AdjustStockDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
