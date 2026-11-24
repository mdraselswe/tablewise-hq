import type { Actor } from "@/platform/auth/actor.ts";

declare global {
  namespace Express {
    interface Request {
      /** The signed-in user, or null for anonymous requests. Set by the authenticate middleware. */
      actor: Actor | null;
      /** Parsed, validated request parts. Set by the route validator. */
      validated: { params: unknown; query: unknown; body: unknown };
    }
  }
}

export {};
