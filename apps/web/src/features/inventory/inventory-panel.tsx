import type { StockLevel, StockReason } from "@tablewise/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowDownRight, ArrowUpRight, History, PackagePlus, Search, SlidersHorizontal } from "lucide-react";
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
import { formatDateTime, STOCK_REASON_LABELS } from "@/lib/format.ts";
import { type AdjustMode, AdjustStockDialog, type AdjustTarget } from "./adjust-dialog.tsx";

interface Row {
  level: StockLevel;
  name: string;
  sku: string;
  category: string;
  available: boolean;
}

type Filter = "all" | "low" | "out";

function stockState(level: StockLevel): { tone: "success" | "warning" | "danger"; label: string } {
  if (level.onHand === 0) return { tone: "danger", label: "Out of stock" };
  if (level.isLow) return { tone: "warning", label: "Low" };
  return { tone: "success", label: "In stock" };
}

/** Inline editor for the low-stock alert level. Saves on blur or Enter. */
function ThresholdInput({ level }: { level: StockLevel }) {
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
      className="h-7 w-16 px-2 text-right text-[0.8125rem]"
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
  const [page, setPage] = useState(1);
  const movements = useQuery(
    movementsQuery(outletId, {
      menuItemId: menuItemId === "all" ? undefined : menuItemId,
      reason: reason === "all" ? undefined : reason,
      page,
      pageSize: 15,
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
  const pages = movements.data ? Math.max(1, Math.ceil(movements.data.total / movements.data.pageSize)) : 1;

  return (
    <Card>
      <CardHeader
        title="Audit trail"
        description="Every change to stock: who, when, why, and the balance after."
        action={
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="Item"
              size="sm"
              value={menuItemId}
              onValueChange={(value) => {
                setMenuItemId(value);
                setPage(1);
              }}
              options={itemOptions}
              className="w-44"
            />
            <Select
              aria-label="Reason"
              size="sm"
              value={reason}
              onValueChange={(value) => {
                setReason(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All reasons" },
                ...Object.entries(STOCK_REASON_LABELS).map(([value, label]) => ({
                  value: value as StockReason,
                  label,
                })),
              ]}
              className="w-40"
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
        <EmptyState icon={<History />} title="No stock changes match" />
      ) : (
        <>
          <Table>
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
          <footer className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground">
            <span className="num">
              {movements.data?.total ?? 0} changes · page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
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
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Stock on hand"
          description="Sales deduct stock automatically. It can never go below zero."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search"
                  aria-label="Search stock"
                  className="h-(--control-h-sm) w-44 pl-8"
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
          <Table>
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
        )}
      </Card>

      <MovementsCard outletId={outletId} rows={rows} timeZone={timeZone} />
      <AdjustStockDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
