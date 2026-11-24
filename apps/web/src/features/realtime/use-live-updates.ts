import type { AnyIntegrationEvent, KitchenTicket, StockLevel } from "@tablewise/contracts";
import { type QueryClient, type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { keys } from "@/api/keys.ts";
import { API_BASE } from "@/lib/api.ts";
import { liveStore } from "./live-store.ts";

const EVENT_TYPES = [
  "sales.sale.completed",
  "inventory.stock.changed",
  "kitchen.ticket.changed",
  "outlets.outlet.upserted",
] as const;

/** Coalesces bursts (ten sales in a second) into one refetch per query prefix. */
function createInvalidator(queryClient: QueryClient, delayMs = 350) {
  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (key: QueryKey) => {
    pending.set(JSON.stringify(key), key);
    timer ??= setTimeout(() => {
      for (const queryKey of pending.values()) void queryClient.invalidateQueries({ queryKey });
      pending.clear();
      timer = undefined;
    }, delayMs);
  };
}

/**
 * Subscribes to the server's event stream (SSE) and keeps cached data current.
 * Small, exact changes (a stock level, a ticket status) are written straight into
 * the cache; aggregates (reports, lists) are refetched.
 * EventSource reconnects by itself; after a gap we refetch everything once.
 */
export function useLiveUpdates(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const invalidate = createInvalidator(queryClient);
    const source = new EventSource(`${API_BASE}/stream`, { withCredentials: true });
    let wasDisconnected = false;

    source.addEventListener("ready", () => {
      liveStore.setConnection("live");
      if (wasDisconnected) void queryClient.invalidateQueries();
      wasDisconnected = false;
    });
    source.addEventListener("error", () => {
      liveStore.setConnection(source.readyState === EventSource.CLOSED ? "offline" : "connecting");
      wasDisconnected = true;
    });

    const handle = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as AnyIntegrationEvent;
      switch (event.type) {
        case "sales.sale.completed": {
          invalidate(keys.reports.all);
          invalidate(keys.sales.all);
          break;
        }
        case "inventory.stock.changed": {
          const { outletId, menuItemId, onHand, isLow } = event.payload;
          queryClient.setQueryData<StockLevel[]>(keys.inventory.levels(outletId), (levels) =>
            levels?.map((level) =>
              level.menuItemId === menuItemId
                ? { ...level, onHand, isLow, updatedAt: event.occurredAt }
                : level,
            ),
          );
          invalidate([...keys.inventory.outlet(outletId), "movements"]);
          break;
        }
        case "kitchen.ticket.changed": {
          const { outletId, ticketId, status } = event.payload;
          const board = queryClient.getQueryData<KitchenTicket[]>(keys.kitchen.board(outletId));
          const known = board?.some((ticket) => ticket.id === ticketId);
          if (board && known) {
            queryClient.setQueryData<KitchenTicket[]>(keys.kitchen.board(outletId), (tickets) =>
              tickets
                ?.map((ticket) => (ticket.id === ticketId ? { ...ticket, status } : ticket))
                .filter((ticket) => ticket.status !== "SERVED"),
            );
          } else {
            invalidate(keys.kitchen.board(outletId)); // a new ticket: fetch it with its items
          }
          break;
        }
        case "outlets.outlet.upserted": {
          invalidate(keys.outlets.all);
          invalidate(keys.reports.all);
          break;
        }
      }
    };
    for (const type of EVENT_TYPES) source.addEventListener(type, handle);

    return () => {
      source.close();
      liveStore.setConnection("connecting");
    };
  }, [enabled, queryClient]);
}
