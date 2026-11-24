import {
  type IntegrationEvent,
  type KitchenTicket,
  TICKET_TRANSITIONS,
  type TicketStatus,
} from "@tablewise/contracts";
import { type Actor, canAccessOutlet } from "@/platform/auth/actor.ts";
import type { Database } from "@/platform/db/database.ts";
import type { Outbox } from "@/platform/events/outbox.ts";
import { InvalidStateTransitionError, NotFoundError } from "@/platform/http/errors.ts";
import type { KitchenRepository } from "./kitchen.repository.ts";

/**
 * Sales older than this never reach the kitchen board: they were synced from an
 * offline terminal (whose local KDS already handled them) or backfilled.
 */
const KITCHEN_WINDOW_MS = 30 * 60_000;

export class KitchenService {
  constructor(
    private readonly db: Database,
    private readonly repository: KitchenRepository,
    private readonly outbox: Outbox,
  ) {}

  listTickets(outletId: string, scope: "active" | "all"): Promise<KitchenTicket[]> {
    return this.repository.list(outletId, scope);
  }

  /** Bump or recall a ticket. Only the moves in TICKET_TRANSITIONS are allowed. */
  updateStatus(actor: Actor, ticketId: string, status: TicketStatus): Promise<KitchenTicket> {
    return this.db.transaction(async () => {
      const ticket = await this.repository.findById(ticketId, { lock: true });
      if (!ticket || !canAccessOutlet(actor, ticket.outletId)) throw new NotFoundError("Ticket", ticketId);
      if (ticket.status === status) return ticket;
      if (!TICKET_TRANSITIONS[ticket.status].includes(status)) {
        throw new InvalidStateTransitionError(ticket.status, status);
      }
      await this.repository.updateStatus(ticketId, status);
      await this.#announce({ ...ticket, status });
      const updated = await this.repository.findById(ticketId);
      if (!updated) throw new NotFoundError("Ticket", ticketId);
      return updated;
    });
  }

  /** Event handler: every fresh sale becomes a NEW ticket on its outlet's board. */
  async onSaleCompleted(event: IntegrationEvent<"sales.sale.completed">): Promise<void> {
    const sale = event.payload;
    if (Date.now() - Date.parse(sale.occurredAt) > KITCHEN_WINDOW_MS) return;
    const ticketId = await this.repository.insertTicket({
      saleId: sale.saleId,
      outletId: sale.outletId,
      receiptNo: sale.receiptNo,
      items: sale.lines.map((line) => ({
        lineNo: line.lineNo,
        itemName: line.itemName,
        quantity: line.quantity,
      })),
    });
    if (ticketId) {
      await this.#announce({
        id: ticketId,
        outletId: sale.outletId,
        saleId: sale.saleId,
        receiptNo: sale.receiptNo,
        status: "NEW",
      });
    }
  }

  async #announce(
    ticket: Pick<KitchenTicket, "id" | "outletId" | "saleId" | "receiptNo" | "status">,
  ): Promise<void> {
    await this.outbox.publish(
      "kitchen.ticket.changed",
      { type: "kitchen_ticket", id: ticket.id },
      {
        ticketId: ticket.id,
        outletId: ticket.outletId,
        saleId: ticket.saleId,
        receiptNo: ticket.receiptNo,
        status: ticket.status,
      },
    );
  }
}
