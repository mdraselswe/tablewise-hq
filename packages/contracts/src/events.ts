import type { StockReason } from "./inventory.ts";
import type { TicketStatus } from "./kitchen.ts";
import type { PaymentMethod } from "./sales.ts";

/**
 * Integration events. A module publishes them through the transactional outbox;
 * other modules (and, after extraction, other services) react to them.
 * Browsers receive the realtime subset over Server-Sent Events.
 */
export interface EventPayloads {
  "outlets.outlet.upserted": {
    outletId: string;
    code: string;
    name: string;
    isActive: boolean;
  };
  "sales.sale.completed": {
    saleId: string;
    outletId: string;
    receiptNo: string;
    totalMinor: number;
    itemCount: number;
    paymentMethod: PaymentMethod;
    businessDate: string;
    cashierName: string | null;
    occurredAt: string;
    createdAt: string;
    lines: {
      lineNo: number;
      menuItemId: string;
      sku: string;
      itemName: string;
      quantity: number;
      unitPriceMinor: number;
      lineTotalMinor: number;
    }[];
  };
  "inventory.stock.changed": {
    outletId: string;
    menuItemId: string;
    onHand: number;
    delta: number;
    reason: StockReason;
    isLow: boolean;
  };
  "kitchen.ticket.changed": {
    ticketId: string;
    outletId: string;
    saleId: string;
    receiptNo: string;
    status: TicketStatus;
  };
}

export type EventType = keyof EventPayloads;

export interface IntegrationEvent<T extends EventType = EventType> {
  id: string;
  type: T;
  occurredAt: string;
  payload: EventPayloads[T];
}

/** Discriminated union, so `switch (event.type)` narrows the payload. */
export type AnyIntegrationEvent = { [T in EventType]: IntegrationEvent<T> }[EventType];

/** Events pushed to browsers over SSE. */
export const REALTIME_EVENT_TYPES = [
  "sales.sale.completed",
  "inventory.stock.changed",
  "kitchen.ticket.changed",
  "outlets.outlet.upserted",
] as const satisfies readonly EventType[];
