import type { CreateOutletRequest, Outlet, UpdateOutletRequest } from "@tablewise/contracts";
import { type Actor, assertOutletAccess, scopeOutlet } from "@/platform/auth/actor.ts";
import type { Database } from "@/platform/db/database.ts";
import type { Outbox } from "@/platform/events/outbox.ts";
import { NotFoundError, OutletInactiveError } from "@/platform/http/errors.ts";
import type { OutletsRepository } from "./outlets.repository.ts";

export class OutletsService {
  constructor(
    private readonly db: Database,
    private readonly repository: OutletsRepository,
    private readonly outbox: Outbox,
  ) {}

  list(actor: Actor): Promise<Outlet[]> {
    return this.repository.list(scopeOutlet(actor, undefined));
  }

  async get(actor: Actor, outletId: string): Promise<Outlet> {
    assertOutletAccess(actor, outletId);
    return this.require(outletId);
  }

  create(input: CreateOutletRequest): Promise<Outlet> {
    return this.db.transaction(async () => {
      const outlet = await this.repository.insert(input);
      await this.#announce(outlet);
      return outlet;
    });
  }

  update(outletId: string, patch: UpdateOutletRequest): Promise<Outlet> {
    return this.db.transaction(async () => {
      const outlet = await this.repository.update(outletId, patch);
      if (!outlet) throw new NotFoundError("Outlet", outletId);
      await this.#announce(outlet);
      return outlet;
    });
  }

  // ---- Public API for other modules -------------------------------------------------

  async require(outletId: string): Promise<Outlet> {
    const outlet = await this.repository.findById(outletId);
    if (!outlet) throw new NotFoundError("Outlet", outletId);
    return outlet;
  }

  /** An outlet that exists and may trade. Sales call this before taking money. */
  async requireActive(outletId: string): Promise<Outlet> {
    const outlet = await this.require(outletId);
    if (!outlet.isActive) throw new OutletInactiveError(outletId);
    return outlet;
  }

  async #announce(outlet: Outlet): Promise<void> {
    await this.outbox.publish(
      "outlets.outlet.upserted",
      { type: "outlet", id: outlet.id },
      { outletId: outlet.id, code: outlet.code, name: outlet.name, isActive: outlet.isActive },
    );
  }
}
