import type { OutletMenuItem, PaymentMethod, Sale, StockLevel, StockShortfall } from "@tablewise/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import {
  Banknote,
  CheckCircle2,
  ChevronUp,
  CreditCard,
  Minus,
  Plus,
  Search,
  ShoppingBasket,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { keys } from "@/api/keys.ts";
import { outletMenuQuery, outletsQuery, salesApi, stockLevelsQuery } from "@/api/resources.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { EmptyState, Kbd, Skeleton } from "@/components/ui/misc.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import { useSessionUser } from "@/features/auth/session.ts";
import { Receipt } from "@/features/sales/receipt.tsx";
import { ApiError } from "@/lib/api.ts";
import { formatMoney } from "@/lib/format.ts";
import { type CartLine, useCart } from "./cart.ts";

const PAYMENT_OPTIONS = [
  {
    value: "CASH",
    label: (
      <>
        <Banknote /> Cash
      </>
    ),
  },
  {
    value: "CARD",
    label: (
      <>
        <CreditCard /> Card
      </>
    ),
  },
  {
    value: "MOBILE_WALLET",
    label: (
      <>
        <Smartphone /> Wallet
      </>
    ),
  },
] as const satisfies readonly { value: PaymentMethod; label: React.ReactNode }[];

const ALL = "__all__";

function ItemTile({
  item,
  stock,
  inCart,
  onAdd,
}: {
  item: OutletMenuItem;
  stock: StockLevel | undefined;
  inCart: number;
  onAdd: () => void;
}) {
  const remaining = (stock?.onHand ?? 0) - inCart;
  const soldOut = remaining <= 0;
  const low = !soldOut && stock !== undefined && remaining <= stock.lowStockThreshold;
  return (
    <motion.button
      layout="position"
      type="button"
      onClick={onAdd}
      disabled={soldOut}
      whileTap={soldOut ? {} : { scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group relative flex min-h-28 flex-col justify-between rounded-xl border bg-card p-3.5 text-left shadow-(--shadow-sm) transition-[border-color,box-shadow] duration-(--motion-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        soldOut ? "cursor-not-allowed opacity-55" : "hover:border-ring/50 hover:shadow-(--shadow-card)",
        inCart > 0 && "border-primary/50 ring-1 ring-primary/25",
      )}
    >
      <div className="pr-6">
        <div className="text-[0.8125rem] leading-snug font-medium">{item.name}</div>
        <div className="mt-0.5 text-[0.6875rem] tracking-wide text-muted-foreground">{item.sku}</div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="num text-sm font-semibold">{formatMoney(item.priceMinor, { currency: false })}</span>
        <span
          className={cn(
            "num text-[0.6875rem]",
            soldOut
              ? "font-medium text-destructive"
              : low
                ? "font-medium text-warning-foreground"
                : "text-muted-foreground",
          )}
        >
          {stock === undefined ? "" : soldOut ? "Sold out" : `${remaining} left`}
        </span>
      </div>
      <AnimatePresence>
        {inCart > 0 ? (
          <motion.span
            key={inCart}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 30 }}
            className="num absolute top-2.5 right-2.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-semibold text-primary-foreground"
          >
            {inCart}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );
}

function CartLineRow({
  line,
  issue,
  onSet,
  onRemove,
}: {
  line: CartLine;
  issue: string | undefined;
  onSet: (quantity: number) => void;
  onRemove: () => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, transition: { duration: 0.12 } }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-3"
    >
      <div className="min-w-0">
        <div className="truncate text-[0.8125rem] font-medium">{line.item.name}</div>
        <div className="num text-xs text-muted-foreground">{formatMoney(line.item.priceMinor)} each</div>
      </div>
      <div className="num text-right text-[0.8125rem] font-medium">
        {formatMoney(line.item.priceMinor * line.quantity, { currency: false })}
      </div>
      <div className="col-span-2 flex items-center justify-between">
        <div className="inline-flex items-center rounded-lg border bg-background">
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-10 lg:size-6"
            onClick={() => onSet(line.quantity - 1)}
            aria-label={`One less ${line.item.name}`}
          >
            <Minus />
          </Button>
          <span className="num w-7 text-center text-[0.8125rem] font-medium" aria-live="polite">
            {line.quantity}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-10 lg:size-6"
            onClick={() => onSet(line.quantity + 1)}
            aria-label={`One more ${line.item.name}`}
          >
            <Plus />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label={`Remove ${line.item.name}`}
          // Hidden until hover only where there is a pointer to hover with.
          className="size-10 text-muted-foreground lg:size-6 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        >
          <X />
        </Button>
      </div>
      {issue ? (
        <p role="alert" className="col-span-2 rounded-md bg-destructive/8 px-2 py-1 text-xs text-destructive">
          {issue}
        </p>
      ) : null}
    </motion.li>
  );
}

export default function PosPage() {
  const user = useSessionUser();
  const outletId = user.outletId ?? "";
  const queryClient = useQueryClient();
  const menu = useQuery(outletMenuQuery(outletId));
  const stock = useQuery(stockLevelsQuery(outletId));
  const outlets = useQuery(outletsQuery);
  const outlet = outlets.data?.find((candidate) => candidate.id === outletId);
  const cart = useCart();
  const [payment, setPayment] = useState<PaymentMethod>("CASH");
  const [category, setCategory] = useState(ALL);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [issues, setIssues] = useState<Map<string, string>>(new Map());
  const [receipt, setReceipt] = useState<{ sale: Sale; replayed: boolean } | null>(null);
  // Phones only: the order opens as a sheet over the menu from the ticket bar.
  const [ticketOpen, setTicketOpen] = useState(false);
  // An emptied cart (Clear, or removing the last line) has nothing left to review.
  const sheetOpen = ticketOpen && cart.lines.length > 0;
  const searchRef = useRef<HTMLInputElement>(null);

  const stockById = useMemo(
    () => new Map((stock.data ?? []).map((level) => [level.menuItemId, level])),
    [stock.data],
  );
  const categories = useMemo(
    () => [...new Set((menu.data ?? []).map((item) => item.category))].sort((a, b) => a.localeCompare(b)),
    [menu.data],
  );
  const visible = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return (menu.data ?? []).filter(
      (item) =>
        (category === ALL || item.category === category) &&
        (!term || item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term)),
    );
  }, [menu.data, category, deferredSearch]);

  // "/" jumps to search, as in most tools a cashier already knows.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(target.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const charge = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      salesApi.create(
        outletId,
        {
          lines: cart.lines.map((line) => ({ menuItemId: line.item.menuItemId, quantity: line.quantity })),
          paymentMethod: payment,
        },
        cart.idempotencyKey,
      ),
    onSuccess: (result) => {
      // Show the new stock at once; the live stream confirms it a moment later.
      queryClient.setQueryData<StockLevel[]>(keys.inventory.levels(outletId), (levels) =>
        levels?.map((level) => {
          const sold = result.sale.lines.find((line) => line.menuItemId === level.menuItemId);
          if (!sold || result.replayed) return level;
          const onHand = Math.max(0, level.onHand - sold.quantity);
          return { ...level, onHand, isLow: onHand <= level.lowStockThreshold };
        }),
      );
      setIssues(new Map());
      setReceipt(result);
      setTicketOpen(false);
      cart.clear();
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return void toast.error("The sale did not go through. Try again.");
      if (error.code === "INSUFFICIENT_STOCK") {
        const shortfalls = (error.details as { shortfalls?: StockShortfall[] } | undefined)?.shortfalls ?? [];
        setIssues(
          new Map(
            shortfalls.map((shortfall) => [
              shortfall.menuItemId,
              shortfall.available === 0
                ? "Sold out. Remove it to continue."
                : `Only ${shortfall.available} left.`,
            ]),
          ),
        );
        void queryClient.invalidateQueries({ queryKey: keys.inventory.levels(outletId) });
        toast.error("Not enough stock for some items. Nothing was charged.");
      } else if (error.code === "ITEMS_NOT_SELLABLE") {
        const ids = (error.details as { menuItemIds?: string[] } | undefined)?.menuItemIds ?? [];
        setIssues(new Map(ids.map((id) => [id, "No longer on this outlet's menu."])));
        void queryClient.invalidateQueries({ queryKey: keys.catalog.outletMenu(outletId) });
        toast.error("Some items were taken off the menu. Nothing was charged.");
      } else if (error.code === "IDEMPOTENCY_KEY_REUSED") {
        // The cart was already charged (the reply was lost) and then the payment method
        // changed. Recording it again could charge twice, so send the cashier to check.
        void queryClient.invalidateQueries({ queryKey: keys.sales.all });
        toast.error("This cart may already be charged. Check Sales history before charging again.");
      } else {
        toast.error(error.message);
      }
    },
  });

  const canCharge = cart.lines.length > 0 && !charge.isPending;

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setTicketOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  return (
    <div className="grid h-[calc(100dvh-var(--shell-top)-var(--shell-bottom))] grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1">
      {/* Catalog */}
      <section aria-label="Menu" className="flex min-h-0 min-w-0 flex-col">
        <div className="space-y-3 border-b px-4 pt-5 pb-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Point of sale</h1>
              <p className="text-[0.8125rem] text-muted-foreground">
                {outlet ? `${outlet.name} · prices and stock for this outlet` : " "}
              </p>
            </div>
            <div className="relative w-full sm:max-w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search items"
                aria-label="Search items"
                className="pr-8 pl-8"
              />
              <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
            </div>
          </div>
          <div
            className="-mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 pb-0.5 [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Categories"
          >
            {[ALL, ...categories].map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={category === name}
                onClick={() => setCategory(name)}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors duration-(--motion-fast)",
                  category === name
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {name === ALL ? "All items" : name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {menu.isPending ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {Array.from({ length: 12 }, (_, index) => (
                <Skeleton key={index} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState icon={<Search />} title="No items match">
              Try another name or category.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {visible.map((item) => (
                <ItemTile
                  key={item.menuItemId}
                  item={item}
                  stock={stockById.get(item.menuItemId)}
                  inCart={cart.quantities.get(item.menuItemId) ?? 0}
                  onAdd={() => {
                    // A sheet left "open" by emptying the cart must not pop up with the first new item.
                    if (cart.lines.length === 0) setTicketOpen(false);
                    cart.add(item);
                    setIssues((current) => {
                      if (!current.has(item.menuItemId)) return current;
                      const next = new Map(current);
                      next.delete(item.menuItemId);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Cart: a side column on wide screens. */}
      <aside aria-label="Current order" className="hidden min-h-0 flex-col border-l bg-card lg:flex">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-[0.9375rem] font-semibold">Current order</h2>
            <p className="num text-xs text-muted-foreground">
              {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {cart.lines.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={cart.clear} className="text-muted-foreground">
                <Trash2 />
                Clear
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setTicketOpen(false)}
              aria-label="Back to the menu"
            >
              <X />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          {cart.lines.length === 0 ? (
            <EmptyState icon={<ShoppingBasket />} title="No items yet" className="h-full">
              Tap an item to add it to the order.
            </EmptyState>
          ) : (
            <ul className="divide-y">
              <AnimatePresence initial={false}>
                {cart.lines.map((line) => (
                  <CartLineRow
                    key={line.item.menuItemId}
                    line={line}
                    issue={issues.get(line.item.menuItemId)}
                    onSet={(quantity) => cart.setQuantity(line.item.menuItemId, quantity)}
                    onRemove={() => cart.remove(line.item.menuItemId)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
        <div className="space-y-4 border-t bg-background/40 px-5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <motion.span
              key={cart.totalMinor}
              initial={{ opacity: 0.4, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              className="num text-2xl font-semibold tracking-tight"
            >
              {formatMoney(cart.totalMinor)}
            </motion.span>
          </div>
          <Segmented
            aria-label="Payment method"
            value={payment}
            onChange={setPayment}
            options={PAYMENT_OPTIONS}
            size="lg"
            className="flex w-full"
          />
          <Button
            size="lg"
            className="h-12 w-full text-[0.9375rem]"
            disabled={!canCharge}
            pending={charge.isPending}
            onClick={() => charge.mutate()}
          >
            {cart.lines.length === 0 ? "Add items to charge" : `Charge ${formatMoney(cart.totalMinor)}`}
          </Button>
        </div>
      </aside>

      {/* Phones: a ticket bar that is always in reach, opening the order as a sheet. */}
      <div className="border-t bg-card px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          disabled={cart.lines.length === 0}
          aria-expanded={sheetOpen}
          className="flex h-12 w-full items-center gap-3 rounded-xl bg-primary px-4 text-primary-foreground shadow-(--shadow-sm) transition-[opacity,scale] duration-(--motion-fast) active:scale-[0.99] disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          <motion.span
            key={cart.itemCount}
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 22 }}
            className="num grid h-7 min-w-7 place-items-center rounded-full bg-primary-foreground/20 px-1.5 text-xs font-semibold"
          >
            {cart.itemCount}
          </motion.span>
          <span className="flex-1 text-left text-sm font-medium">
            {cart.lines.length === 0 ? "Tap items to start an order" : "Review order"}
          </span>
          {cart.lines.length > 0 ? (
            <>
              <span className="num text-[0.9375rem] font-semibold">{formatMoney(cart.totalMinor)}</span>
              <ChevronUp className="size-4" aria-hidden="true" />
            </>
          ) : null}
        </button>
      </div>
      <AnimatePresence>
        {sheetOpen ? (
          <>
            <motion.div
              key="ticket-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-x-0 top-0 bottom-(--shell-bottom) z-30 bg-black/40 lg:hidden"
              onClick={() => setTicketOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              key="ticket-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Current order"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-0 bottom-(--shell-bottom) z-30 flex max-h-[calc(100dvh-var(--shell-bottom)-2rem)] flex-col rounded-t-2xl bg-card shadow-(--shadow-overlay) lg:hidden"
            >
              <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden="true" />
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <h2 className="text-[0.9375rem] font-semibold">Current order</h2>
                  <p className="num text-xs text-muted-foreground">
                    {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {cart.lines.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={cart.clear} className="text-muted-foreground">
                      <Trash2 />
                      Clear
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="lg:hidden"
                    onClick={() => setTicketOpen(false)}
                    aria-label="Back to the menu"
                  >
                    <X />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5">
                {cart.lines.length === 0 ? (
                  <EmptyState icon={<ShoppingBasket />} title="No items yet" className="h-full">
                    Tap an item to add it to the order.
                  </EmptyState>
                ) : (
                  <ul className="divide-y">
                    <AnimatePresence initial={false}>
                      {cart.lines.map((line) => (
                        <CartLineRow
                          key={line.item.menuItemId}
                          line={line}
                          issue={issues.get(line.item.menuItemId)}
                          onSet={(quantity) => cart.setQuantity(line.item.menuItemId, quantity)}
                          onRemove={() => cart.remove(line.item.menuItemId)}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
              <div className="space-y-4 border-t bg-background/40 px-5 py-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <motion.span
                    key={cart.totalMinor}
                    initial={{ opacity: 0.4, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="num text-2xl font-semibold tracking-tight"
                  >
                    {formatMoney(cart.totalMinor)}
                  </motion.span>
                </div>
                <Segmented
                  aria-label="Payment method"
                  value={payment}
                  onChange={setPayment}
                  options={PAYMENT_OPTIONS}
                  size="lg"
                  className="flex w-full"
                />
                <Button
                  size="lg"
                  className="h-12 w-full text-[0.9375rem]"
                  disabled={!canCharge}
                  pending={charge.isPending}
                  onClick={() => charge.mutate()}
                >
                  {cart.lines.length === 0 ? "Add items to charge" : `Charge ${formatMoney(cart.totalMinor)}`}
                </Button>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <Dialog open={receipt !== null} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="sm:max-w-sm">
          {receipt ? (
            <>
              <DialogHeader className="justify-items-center pr-0 text-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28, delay: 0.05 }}
                  className="mb-1 grid size-11 place-items-center rounded-full bg-success/12 text-success"
                >
                  <CheckCircle2 className="size-6" />
                </motion.div>
                <DialogTitle>Payment received</DialogTitle>
                <DialogDescription>
                  {receipt.replayed
                    ? "This order was already charged. Showing the original receipt."
                    : "Sent to the kitchen display."}
                </DialogDescription>
              </DialogHeader>
              <Receipt sale={receipt.sale} {...(outlet ? { outletName: outlet.name } : {})} />
              <Button autoFocus size="lg" className="w-full" onClick={() => setReceipt(null)}>
                New order
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
