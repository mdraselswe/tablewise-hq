import { jwtVerify, SignJWT } from "jose";
import { Role } from "@tablewise/contracts";
import type { Actor } from "./actor.ts";

const ISSUER = "tablewise-api";
const AUDIENCE = "tablewise";

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

/**
 * Stateless HS256 session tokens. Any API instance can verify a token without a
 * shared session store, which keeps horizontal scaling (and a future auth service)
 * simple. The browser keeps it in an httpOnly cookie, so page scripts cannot read it.
 */
export class TokenService {
  readonly #key: Uint8Array;

  constructor(
    secret: string,
    readonly ttlMinutes: number,
  ) {
    this.#key = new TextEncoder().encode(secret);
  }

  async issue(actor: Actor): Promise<IssuedToken> {
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);
    const token = await new SignJWT({
      email: actor.email,
      name: actor.fullName,
      role: actor.role,
      outletId: actor.outletId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(actor.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.#key);
    return { token, expiresAt };
  }

  /** Returns the actor for a valid token, or null for a missing, expired or tampered one. */
  async verify(token: string): Promise<Actor | null> {
    try {
      const { payload } = await jwtVerify(token, this.#key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ["HS256"],
      });
      const role = Role.safeParse(payload["role"]);
      if (!payload.sub || !role.success) return null;
      return {
        id: payload.sub,
        email: String(payload["email"] ?? ""),
        fullName: String(payload["name"] ?? ""),
        role: role.data,
        outletId: typeof payload["outletId"] === "string" ? payload["outletId"] : null,
      };
    } catch {
      return null;
    }
  }
}
