import type { MenuItem, OutletAssignment, StockLevel } from "@tablewise/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Plus, Search, UtensilsCrossed } from "lucide-react";
import { type FormEvent, useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { keys } from "@/api/keys.ts";
import { assignmentsQuery, catalogApi, menuItemsInfiniteQuery, stockLevelsQuery } from "@/api/resources.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Field, Input } from "@/components/ui/input.tsx";
import { Card, CardHeader, EmptyState, Skeleton, Switch } from "@/components/ui/misc.tsx";
import { MoneyInput } from "@/components/ui/money-input.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table.tsx";
import { formatMoney, minorToInput, parseMoney } from "@/lib/format.ts";

type View = "assigned" | "unassigned" | "all";

const MASTER_PAGE_SIZE = 50;

/** What the table needs from an item, available both from the master menu and from an assignment. */
type RowItem = Pick<MenuItem, "id" | "sku" | "name" | "category" | "basePriceMinor">;

interface Row {
  item: RowItem;
  assignment: OutletAssignment | undefined;
  stock: StockLevel | undefined;
}

/** Writes go through one mutation; every success refreshes the outlet's catalog, menu and stock. */
function useAssignmentMutations(outletId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.catalog.all });
    void queryClient.invalidateQueries({ queryKey: keys.inventory.outlet(outletId) });
  };
  const upsert = useMutation({
    mutationFn: (input: { menuItemId: string; body: Parameters<typeof catalogApi.assign>[2] }) =>
      catalogApi.assign(outletId, input.menuItemId, input.body),
    // Optimistic for toggles and price edits, so the table never waits on the network.
    onMutate: async ({ menuItemId, body }) => {
      const key = keys.catalog.assignments(outletId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<OutletAssignment[]>(key);
      queryClient.setQueryData<OutletAssignment[]>(key, (rows) =>
        rows?.map((row) => {
          if (row.menuItemId !== menuItemId) return row;
          const priceOverrideMinor =
            body.priceOverrideMinor === undefined ? row.priceOverrideMinor : body.priceOverrideMinor;
          return {
            ...row,
            ...(body.isAvailable === undefined ? {} : { isAvailable: body.isAvailable }),
            priceOverrideMinor,
            effectivePriceMinor: priceOverrideMinor ?? row.basePriceMinor,
          };
        }),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(keys.catalog.assignments(outletId), context.previous);
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (menuItemId: string) => catalogApi.unassign(outletId, menuItemId),
    onSuccess: () => toast.success("Removed from this outlet"),
    onSettled: refresh,
  });
  return { upsert, remove };
}

function PriceCell({
  row,
  onSave,
  className,
}: {
  row: Row & { assignment: OutletAssignment };
  onSave: (minor: number | null) => void;
  className?: string;
}) {
  const current = row.assignment.priceOverrideMinor;
  const [value, setValue] = useState(current === null ? "" : minorToInput(current));
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    const trimmed = value.trim();
    if (trimmed === "") {
      setInvalid(false);
      if (current !== null) onSave(null);
      return;
    }
    const minor = parseMoney(trimmed);
    if (minor === undefined) return setInvalid(true);
    setInvalid(false);
    setValue(minorToInput(minor));
    if (minor !== current) onSave(minor === row.item.basePriceMinor ? null : minor);
  };
  return (
    <div className="flex items-center justify-end gap-2">
      {current !== null ? (
        <span className="size-1.5 rounded-full bg-primary" title="Outlet price override" />
      ) : null}
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        placeholder={minorToInput(row.item.basePriceMinor)}
        aria-label={`Outlet price for ${row.item.name}. Leave empty to use the base price.`}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        className={cn(
          "num h-7 w-24 px-2 text-right text-[0.8125rem]",
          current !== null && "border-primary/50",
          className,
        )}
      />
    </div>
  );
}

function AssignDialog({
  item,
  onClose,
  onAssign,
  pending,
}: {
  item: RowItem | null;
  onClose: () => void;
  onAssign: (body: { openingStock: number; priceOverrideMinor?: number }) => void;
  pending: boolean;
}) {
  const [stock, setStock] = useState("20");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string>();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const openingStock = Number.parseInt(stock, 10);
    if (Number.isNaN(openingStock) || openingStock < 0) return setError("Enter a whole number of units.");
    const override = price.trim() ? parseMoney(price) : undefined;
    if (price.trim() && override === undefined)
      return setError("Enter a price like 250 or 250.50, or leave it empty.");
    onAssign({
      openingStock,
      ...(override !== undefined && item && override !== item.basePriceMinor
        ? { priceOverrideMinor: override }
        : {}),
    });
  };
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {item ? (
          <form onSubmit={submit} className="grid gap-5" noValidate>
            <DialogHeader>
              <DialogTitle>Assign {item.name}</DialogTitle>
              <DialogDescription>
                It appears on this outlet's menu at once. Base price {formatMoney(item.basePriceMinor)}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opening stock" htmlFor="assign-stock" hint="Recorded in the audit trail.">
                <Input
                  id="assign-stock"
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(event) => setStock(event.target.value)}
                  autoFocus
                />
              </Field>
              <Field label="Outlet price" htmlFor="assign-price" hint="Empty uses the base price.">
                <MoneyInput
                  id="assign-price"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder={minorToInput(item.basePriceMinor)}
                />
              </Field>
            </div>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" pending={pending}>
                Assign to outlet
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({
  row,
  onClose,
  onConfirm,
  pending,
}: {
  row: Row | null;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {row ? (
          <div className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Remove {row.item.name} from this outlet?</DialogTitle>
              <DialogDescription>
                It leaves the outlet's menu and its stock level ({row.stock?.onHand ?? 0} on hand) is deleted.
                Past sales keep their lines. To stop selling for a while, turn off “On sale” instead.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Keep it
              </Button>
              <Button variant="destructive" pending={pending} onClick={onConfirm}>
                Remove
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The outlet's menu, set from HQ: which master items it sells, at what price, and
 * whether each is on sale right now.
 */
export function AssignmentsPanel({ outletId }: { outletId: string }) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [view, setView] = useState<View>("assigned");
  // "On menu" comes from the outlet's assignments, which are complete. The other views
  // page through the master menu on the server ("Load more"), with search and the
  // "not on this menu" filter applied there, so no item is ever out of reach.
  const assignments = useQuery(assignmentsQuery(outletId));
  const stock = useQuery(stockLevelsQuery(outletId));
  const master = useInfiniteQuery({
    ...menuItemsInfiniteQuery({
      ...(deferredSearch ? { search: deferredSearch } : {}),
      ...(view === "unassigned" ? { notAssignedTo: outletId } : {}),
      status: "active",
      pageSize: MASTER_PAGE_SIZE,
    }),
    enabled: view !== "assigned",
  });
  const [assigning, setAssigning] = useState<RowItem | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const { upsert, remove } = useAssignmentMutations(outletId);

  const rows = useMemo<Row[]>(() => {
    const byItem = new Map((assignments.data ?? []).map((assignment) => [assignment.menuItemId, assignment]));
    const stockByItem = new Map((stock.data ?? []).map((level) => [level.menuItemId, level]));
    if (view === "assigned") {
      const needle = deferredSearch.toLowerCase();
      return (assignments.data ?? [])
        .filter((a) => !needle || `${a.name} ${a.sku}`.toLowerCase().includes(needle))
        .map((a) => ({
          item: {
            id: a.menuItemId,
            sku: a.sku,
            name: a.name,
            category: a.category,
            basePriceMinor: a.basePriceMinor,
          },
          assignment: a,
          stock: stockByItem.get(a.menuItemId),
        }))
        .sort(
          (x, y) => x.item.category.localeCompare(y.item.category) || x.item.name.localeCompare(y.item.name),
        );
    }
    // Server order (category, name) is kept so "Load more" only appends.
    return (master.data?.pages ?? [])
      .flatMap((page) => page.items)
      .map((item) => ({ item, assignment: byItem.get(item.id), stock: stockByItem.get(item.id) }))
      .filter((row) => view === "all" || !row.assignment);
  }, [master.data, assignments.data, stock.data, view, deferredSearch]);
  const masterTotal = master.data?.pages[0]?.total ?? 0;
  const loading = view === "assigned" ? assignments.isPending : master.isPending || assignments.isPending;

  const assignedCount = assignments.data?.length ?? 0;
  const overrideCount = (assignments.data ?? []).filter(
    (assignment) => assignment.priceOverrideMinor !== null,
  ).length;

  return (
    <Card>
      <CardHeader
        title="Menu and pricing"
        description={`${assignedCount} items on this outlet's menu, ${overrideCount} with an outlet price. Edit a price and press Enter; empty means base price.`}
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-40 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                aria-label="Search items"
                className="h-(--control-h-sm) w-full pl-8 sm:w-44"
              />
            </div>
            <Segmented
              aria-label="Show"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "assigned", label: "On menu" },
                { value: "unassigned", label: "Not assigned" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
        }
      />
      {loading ? (
        <div className="grid gap-2 px-5 pb-5">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-11" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed />}
          title={view === "assigned" ? "Nothing on this outlet's menu yet" : "Nothing to show"}
        >
          {view === "assigned" ? "Switch to “Not assigned” and add items." : null}
        </EmptyState>
      ) : (
        <>
          {/* Phones and tablets: one card per item, with the price and on-sale switch in thumb reach. */}
          <ul className="divide-y divide-border/70 border-t lg:hidden">
            {rows.map((row) => (
              <li key={row.item.id} className="grid gap-2.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="truncate text-sm font-medium">{row.item.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.item.category} · <span className="font-mono">{row.item.sku}</span>
                      {row.stock ? (
                        <span className={cn(row.stock.isLow && "font-medium text-warning-foreground")}>
                          {" "}
                          · {row.stock.onHand} in stock
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {row.assignment ? (
                    <Switch
                      checked={row.assignment.isAvailable}
                      onCheckedChange={(isAvailable) =>
                        upsert.mutate({ menuItemId: row.item.id, body: { isAvailable } })
                      }
                      aria-label={`${row.item.name} on sale`}
                      className="mt-0.5 shrink-0 after:absolute after:-inset-3 after:content-['']"
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 shrink-0"
                      onClick={() => setAssigning(row.item)}
                    >
                      <Plus />
                      Assign
                    </Button>
                  )}
                </div>
                {row.assignment ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="num text-xs text-muted-foreground">
                      Base {formatMoney(row.item.basePriceMinor, { currency: false })}
                    </span>
                    <div className="flex items-center gap-1">
                      <PriceCell
                        key={`${row.assignment.priceOverrideMinor}`}
                        row={{ ...row, assignment: row.assignment }}
                        onSave={(priceOverrideMinor) =>
                          upsert.mutate({ menuItemId: row.item.id, body: { priceOverrideMinor } })
                        }
                        className="h-10 w-28"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 text-muted-foreground hover:text-destructive"
                        onClick={() => setRemoving(row)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <span className="num text-xs text-muted-foreground">
                    Base {formatMoney(row.item.basePriceMinor, { currency: false })}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Table stickyHeader className="hidden lg:table">
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Category</TH>
                <TH numeric>Base price</TH>
                <TH numeric>Outlet price</TH>
                <TH numeric>Stock</TH>
                <TH>On sale</TH>
                <TH className="text-right">Menu</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.item.id}>
                  <TD>
                    <div className="font-medium">{row.item.name}</div>
                    <div className="font-mono text-[0.6875rem] text-muted-foreground">{row.item.sku}</div>
                  </TD>
                  <TD className="text-muted-foreground">{row.item.category}</TD>
                  <TD numeric className="text-muted-foreground">
                    {formatMoney(row.item.basePriceMinor, { currency: false })}
                  </TD>
                  <TD numeric>
                    {row.assignment ? (
                      <PriceCell
                        key={`${row.assignment.priceOverrideMinor}`}
                        row={{ ...row, assignment: row.assignment }}
                        onSave={(priceOverrideMinor) =>
                          upsert.mutate({ menuItemId: row.item.id, body: { priceOverrideMinor } })
                        }
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD numeric className={cn(row.stock?.isLow && "font-medium text-warning-foreground")}>
                    {row.stock?.onHand ?? "—"}
                  </TD>
                  <TD>
                    {row.assignment ? (
                      <Switch
                        checked={row.assignment.isAvailable}
                        onCheckedChange={(isAvailable) =>
                          upsert.mutate({ menuItemId: row.item.id, body: { isAvailable } })
                        }
                        aria-label={`${row.item.name} on sale`}
                      />
                    ) : null}
                  </TD>
                  <TD className="text-right">
                    {row.assignment ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setRemoving(row)}
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setAssigning(row.item)}>
                        <Plus />
                        Assign
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
      {view !== "assigned" && !loading && rows.length > 0 ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
          <span className="num">
            Showing {rows.length} of {masterTotal}{" "}
            {view === "unassigned" ? "items not on this menu" : "items"}
          </span>
          {master.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-full sm:h-8 sm:w-auto"
              disabled={master.isFetchingNextPage}
              onClick={() => void master.fetchNextPage()}
            >
              {master.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </footer>
      ) : null}
      <AssignDialog
        item={assigning}
        pending={upsert.isPending}
        onClose={() => setAssigning(null)}
        onAssign={(body) => {
          if (!assigning) return;
          const item = assigning;
          upsert.mutate(
            { menuItemId: item.id, body },
            {
              onSuccess: () => {
                toast.success(`${item.name} is on the menu`);
                setAssigning(null);
              },
            },
          );
        }}
      />
      <RemoveDialog
        row={removing}
        pending={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) remove.mutate(removing.item.id, { onSuccess: () => setRemoving(null) });
        }}
      />
    </Card>
  );
}
