import type { Role } from "@tablewise/contracts";
import { ForbiddenError } from "@/platform/http/errors.ts";

/** The signed-in user performing a request, as carried in the session token. */
export interface Actor {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  outletId: string | null;
}

export function isHq(actor: Actor): boolean {
  return actor.role === "HQ_ADMIN";
}

/** HQ may touch every outlet; outlet staff only their own. */
export function canAccessOutlet(actor: Actor, outletId: string): boolean {
  return isHq(actor) || actor.outletId === outletId;
}

export function assertOutletAccess(actor: Actor, outletId: string): void {
  if (!canAccessOutlet(actor, outletId)) {
    throw new ForbiddenError("You can only access your own outlet");
  }
}

/**
 * Resolves which outlet a list or report query covers. Outlet staff are always
 * pinned to their own outlet; HQ may pick one or see all (undefined).
 */
export function scopeOutlet(actor: Actor, requested: string | undefined): string | undefined {
  if (isHq(actor)) return requested;
  if (requested && requested !== actor.outletId) {
    throw new ForbiddenError("You can only access your own outlet");
  }
  return actor.outletId ?? undefined;
}
