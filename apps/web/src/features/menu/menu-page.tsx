import type { MenuItem } from "@tablewise/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Plus, Search, UtensilsCrossed } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useSearchParams } from "react-router";
import { categoriesQuery, menuItemQuery, menuItemsQuery } from "@/api/resources.ts";
import { Page } from "@/components/layout/page.tsx";
import { StatusDot } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, EmptyState, Skeleton } from "@/components/ui/misc.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import { Select } from "@/components/ui/select.tsx";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table.tsx";
import { formatCount, formatMoney } from "@/lib/format.ts";
import { MenuItemDialog, type MenuItemDialogState } from "./menu-item-dialog.tsx";

const PAGE_SIZE = 20;
type Status = "all" | "active" | "inactive";

export default function MenuPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<Status>("all");
  const [page, setPage] = useState(1);

  const categories = useQuery(categoriesQuery);
  const items = useQuery(
    menuItemsQuery({
      ...(deferredSearch ? { search: deferredSearch } : {}),
      ...(category !== "all" ? { category } : {}),
      status,
      page,
      pageSize: PAGE_SIZE,
    }),
  );

  // The open dialog lives in the URL (?new=1, ?item=<id>), so it survives a reload
  // and the command palette can link straight to an item.
  const queryClient = useQueryClient();
  const linkedId = params.get("item");
  const linked = useQuery({ ...menuItemQuery(linkedId ?? ""), enabled: linkedId !== null });
  const dialog: MenuItemDialogState =
    params.get("new") === "1" ? { mode: "create" } : linked.data ? { mode: "edit", item: linked.data } : null;
  const openItem = (item: MenuItem) => {
    queryClient.setQueryData(menuItemQuery(item.id).queryKey, item); // no refetch to open it
    setParams({ item: item.id });
  };
  const closeDialog = () => setParams({}, { replace: true });

  const pages = items.data ? Math.max(1, Math.ceil(items.data.total / PAGE_SIZE)) : 1;

  return (
    <Page
      title="Master menu"
      description="Items are created once here. Each outlet sells only what is assigned to it, at its own price if you set one."
      actions={
        <Button onClick={() => setParams({ new: "1" })}>
          <Plus />
          New item
        </Button>
      }
    >
      <Card className="overflow-clip">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5">
          <div className="relative w-full sm:w-auto sm:max-w-72 sm:min-w-56 sm:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or SKU"
              aria-label="Search menu items"
              className="h-(--control-h-sm) pl-8"
            />
          </div>
          <Select
            aria-label="Category"
            size="sm"
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All categories" },
              ...(categories.data ?? []).map((name) => ({ value: name, label: name })),
            ]}
            className="min-w-36 flex-1 sm:w-44 sm:flex-none"
          />
          <Segmented
            aria-label="Status"
            size="sm"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            className="ml-auto"
          />
        </div>
        {items.isPending ? (
          <div className="grid gap-2 p-5">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : items.data?.items.length === 0 ? (
          <EmptyState icon={<UtensilsCrossed />} title="No items match">
            {deferredSearch || category !== "all" || status !== "all"
              ? "Try a different search or filter."
              : "Create the first item of the master menu."}
          </EmptyState>
        ) : (
          <>
            {/* Phones: one tappable row per item; the price is what people look for. */}
            <ul
              className={cn(
                "divide-y divide-border/70 md:hidden",
                items.isPlaceholderData && "opacity-60 transition-opacity",
              )}
            >
              {items.data?.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none focus-visible:bg-muted/60 active:bg-muted"
                  >
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{item.name}</span>
                        {item.isActive ? null : (
                          <span className="shrink-0 text-xs text-muted-foreground">Inactive</span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {item.category} · <span className="font-mono">{item.sku}</span> ·{" "}
                        {item.assignedOutletCount} {item.assignedOutletCount === 1 ? "outlet" : "outlets"}
                      </span>
                    </div>
                    <span className="num shrink-0 text-sm font-semibold">
                      {formatMoney(item.basePriceMinor, { currency: false })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Table stickyHeader className="hidden md:table">
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH>SKU</TH>
                  <TH>Category</TH>
                  <TH numeric>Base price</TH>
                  <TH numeric>Outlets</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody className={cn(items.isPlaceholderData && "opacity-60 transition-opacity")}>
                {items.data?.items.map((item) => (
                  <TR
                    key={item.id}
                    data-clickable="true"
                    tabIndex={0}
                    onClick={() => openItem(item)}
                    onKeyDown={(event) => event.key === "Enter" && openItem(item)}
                    className="outline-none focus-visible:bg-muted/60"
                  >
                    <TD>
                      <div className="font-medium">{item.name}</div>
                      {item.description ? (
                        <div className="max-w-md truncate text-xs text-muted-foreground">
                          {item.description}
                        </div>
                      ) : null}
                    </TD>
                    <TD className="font-mono text-xs text-muted-foreground">{item.sku}</TD>
                    <TD>{item.category}</TD>
                    <TD numeric className="font-medium">
                      {formatMoney(item.basePriceMinor)}
                    </TD>
                    <TD numeric>{item.assignedOutletCount}</TD>
                    <TD>
                      <StatusDot tone={item.isActive ? "success" : "neutral"}>
                        {item.isActive ? "Active" : "Inactive"}
                      </StatusDot>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
              <span className="num">
                {formatCount(items.data?.total ?? 0)} items · page {page} of {pages}
              </span>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1 sm:h-8 sm:flex-none"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1 sm:h-8 sm:flex-none"
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
      <MenuItemDialog state={dialog} onClose={closeDialog} />
    </Page>
  );
}
