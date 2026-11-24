import { z } from "zod";
import { Id } from "./common.ts";

export const TicketStatus = z.enum(["NEW", "PREPARING", "READY", "SERVED"]);
export type TicketStatus = z.infer<typeof TicketStatus>;

/** Allowed moves on the kitchen board. Going one step back ("recall") is allowed until served. */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["PREPARING"],
  PREPARING: ["READY", "NEW"],
  READY: ["SERVED", "PREPARING"],
  SERVED: [],
};

export const UpdateTicketStatusRequest = z.object({ status: TicketStatus });
export type UpdateTicketStatusRequest = z.infer<typeof UpdateTicketStatusRequest>;

export const ListTicketsQuery = z.object({
  scope: z.enum(["active", "all"]).default("active"),
});
export type ListTicketsQuery = z.output<typeof ListTicketsQuery>;

export const TicketParams = z.object({ ticketId: Id });

export interface KitchenTicketItem {
  lineNo: number;
  itemName: string;
  quantity: number;
}

export interface KitchenTicket {
  id: string;
  saleId: string;
  outletId: string;
  receiptNo: string;
  status: TicketStatus;
  items: KitchenTicketItem[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
}
