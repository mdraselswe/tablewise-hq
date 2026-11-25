import { type KitchenTicket, TICKET_TRANSITIONS, type TicketStatus } from "@tablewise/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { ChefHat, Undo2 } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useMemo, useState } from "react";
import { keys } from "@/api/keys.ts";
import { kitchenApi, kitchenQuery } from "@/api/resources.ts";
import { Page } from "@/components/layout/page.tsx";
import { Button } from "@/components/ui/button.tsx";
import { EmptyState, Skeleton } from "@/components/ui/misc.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import { useSessionUser } from "@/features/auth/session.ts";
import { useNow } from "@/hooks/use-now.ts";
import { formatElapsed, formatTime } from "@/lib/format.ts";

type BoardStatus = Exclude<TicketStatus, "SERVED">;

const COLUMNS: { status: BoardStatus; title: string; action: string; accent: string }[] = [
  { status: "NEW", title: "New", action: "Start", accent: "bg-info" },
  { status: "PREPARING", title: "Preparing", action: "Ready", accent: "bg-warning" },
  { status: "READY", title: "Ready to serve", action: "Served", accent: "bg-success" },
];

/** Minutes after which a ticket turns amber, then red. */
const WARN_AFTER_MIN = 8;
const LATE_AFTER_MIN = 15;

const forward = (status: TicketStatus) => TICKET_TRANSITIONS[status][0];
const backward = (status: TicketStatus) =>
  TICKET_TRANSITIONS[status].find((next) => next !== forward(status));

function TicketCard({
  ticket,
  now,
  action,
  onMove,
}: {
  ticket: KitchenTicket;
  now: number;
  action: string;
  onMove: (status: TicketStatus) => void;
}) {
  const minutes = (now - Date.parse(ticket.createdAt)) / 60_000;
  const late = minutes >= LATE_AFTER_MIN;
  const warn = !late && minutes >= WARN_AFTER_MIN;
  const next = forward(ticket.status);
  const back = backward(ticket.status);
  const itemCount = ticket.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <motion.article
      layout
      layoutId={ticket.id}
      initial={{ opacity: 0, scale: 0.96, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: "spring", bounce: 0.1, duration: 0.45 }}
      className={cn(
        "rounded-(--radius-card) border bg-card shadow-(--shadow-card)",
        late && "border-destructive/50 ring-1 ring-destructive/20",
        warn && "border-warning/60",
      )}
      aria-label={`Order ${ticket.receiptNo}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-dashed px-3.5 py-2.5">
        <div>
          <div className="font-mono text-[0.8125rem] font-semibold tracking-wide">{ticket.receiptNo}</div>
          <div className="text-[0.6875rem] text-muted-foreground">
            {formatTime(ticket.createdAt)} · {itemCount} {itemCount === 1 ? "item" : "items"}
          </div>
        </div>
        <span
          className={cn(
            "num rounded-md px-2 py-1 font-mono text-[0.8125rem] font-semibold",
            late
              ? "bg-destructive/12 text-destructive"
              : warn
                ? "bg-warning/18 text-warning-foreground"
                : "bg-muted text-muted-foreground",
          )}
          aria-label={`Waiting ${Math.floor(minutes)} minutes`}
        >
          {formatElapsed(ticket.createdAt, now)}
        </span>
      </header>
      <ul className="grid gap-1.5 px-3.5 py-3">
        {ticket.items.map((item) => (
          <li key={item.lineNo} className="flex items-baseline gap-2.5 text-sm">
            <span className="num w-6 shrink-0 text-right font-semibold text-primary">{item.quantity}x</span>
            <span className="leading-snug">{item.itemName}</span>
          </li>
        ))}
      </ul>
      <footer className="flex gap-2 px-3.5 pb-3.5">
        {back ? (
          <Button
            variant="outline"
            size="icon-sm"
            className="size-10 md:size-(--control-h-sm)"
            onClick={() => onMove(back)}
            aria-label={`Move ${ticket.receiptNo} back`}
          >
            <Undo2 />
          </Button>
        ) : null}
        {next ? (
          <Button
            size="sm"
            className="h-10 flex-1 md:h-(--control-h-sm)"
            variant={ticket.status === "READY" ? "outline" : "default"}
            onClick={() => onMove(next)}
          >
            {action}
          </Button>
        ) : null}
      </footer>
    </motion.article>
  );
}

export default function KitchenPage() {
  const user = useSessionUser();
  const outletId = user.outletId ?? "";
  const queryClient = useQueryClient();
  const board = useQuery({ ...kitchenQuery(outletId), refetchInterval: 60_000 });
  const now = useNow(1000);
  // Phones show one column at a time; three stacked columns meant scrolling past New to reach Ready.
  const [shown, setShown] = useState<BoardStatus>("NEW");
  const boardKey = keys.kitchen.board(outletId);

  const move = useMutation({
    mutationFn: ({ ticket, status }: { ticket: KitchenTicket; status: TicketStatus }) =>
      kitchenApi.move(ticket.id, status),
    // Optimistic: the card moves on tap; a rejected move (someone else bumped it) snaps back.
    onMutate: async ({ ticket, status }) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<KitchenTicket[]>(boardKey);
      queryClient.setQueryData<KitchenTicket[]>(boardKey, (tickets) =>
        tickets
          ?.map((candidate) => (candidate.id === ticket.id ? { ...candidate, status } : candidate))
          .filter((candidate) => candidate.status !== "SERVED"),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: boardKey }),
  });

  const columns = useMemo(() => {
    const byStatus = new Map<BoardStatus, KitchenTicket[]>(COLUMNS.map((column) => [column.status, []]));
    for (const ticket of board.data ?? []) {
      if (ticket.status !== "SERVED") byStatus.get(ticket.status)?.push(ticket);
    }
    // Oldest first: the ticket that has waited longest is always at the top.
    for (const tickets of byStatus.values()) tickets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return byStatus;
  }, [board.data]);

  const total = board.data?.length ?? 0;

  return (
    <Page
      title="Kitchen display"
      description="New orders appear here the moment they are paid. Tap to move them along."
      actions={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-warning" /> {WARN_AFTER_MIN}+ min
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-destructive" /> {LATE_AFTER_MIN}+ min
          </span>
          <span className="num font-medium text-foreground">{total} open</span>
        </div>
      }
    >
      {board.isPending ? (
        <div className="grid gap-(--page-gap) md:grid-cols-3">
          {COLUMNS.map((column) => (
            <Skeleton key={column.status} className="h-96 rounded-(--radius-card)" />
          ))}
        </div>
      ) : (
        <LayoutGroup>
          <Segmented
            aria-label="Column"
            value={shown}
            onChange={setShown}
            options={COLUMNS.map((column) => ({
              value: column.status,
              label: `${column.status === "READY" ? "Ready" : column.title} ${columns.get(column.status)?.length ?? 0}`,
            }))}
            className="flex w-full md:hidden"
          />
          <div className="grid items-start gap-(--page-gap) md:grid-cols-3">
            {COLUMNS.map((column) => {
              const tickets = columns.get(column.status) ?? [];
              return (
                <section
                  key={column.status}
                  aria-label={column.title}
                  className={cn(
                    "rounded-(--radius-card) bg-secondary/60 p-2.5 md:block md:min-h-[60vh]",
                    column.status === shown ? "block" : "hidden",
                  )}
                >
                  <header className="flex items-center justify-between px-1.5 pt-1 pb-3">
                    <h2 className="inline-flex items-center gap-2 text-[0.8125rem] font-semibold">
                      <span className={cn("size-2 rounded-full", column.accent)} aria-hidden="true" />
                      {column.title}
                    </h2>
                    <span className="num rounded-full bg-card px-2 py-0.5 text-xs font-medium shadow-(--shadow-sm)">
                      {tickets.length}
                    </span>
                  </header>
                  <div className="grid gap-2.5">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {tickets.map((ticket) => (
                        <TicketCard
                          key={ticket.id}
                          ticket={ticket}
                          now={now}
                          action={column.action}
                          onMove={(status) => move.mutate({ ticket, status })}
                        />
                      ))}
                    </AnimatePresence>
                    {tickets.length === 0 ? (
                      <p className="px-2 py-8 text-center text-xs text-muted-foreground">Nothing here</p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
          {total === 0 ? (
            <EmptyState icon={<ChefHat />} title="All caught up">
              Paid orders from the counter show up here instantly.
            </EmptyState>
          ) : null}
        </LayoutGroup>
      )}
    </Page>
  );
}
