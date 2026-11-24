import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { SessionValidator } from "@/platform/auth/actor.ts";
import type { TokenService } from "@/platform/auth/token-service.ts";

export const SESSION_COOKIE = "tw_session";

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

/** Accepts a caller's X-Request-Id (for tracing across services) or creates one. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  req.id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
};

/**
 * Resolves the actor from the session cookie (browsers) or a Bearer token (API
 * clients, other services). It never rejects: routes decide whether a session is
 * required, so public routes and invalid tokens both just see `actor = null`.
 *
 * A valid signature is not enough: the user must still be active with the same role
 * and outlet (one primary-key lookup), so revoking access takes effect at once.
 */
export function authenticate(tokens: TokenService, sessions: SessionValidator): RequestHandler {
  return async (req, _res, next) => {
    req.actor = null;
    const header = req.header("authorization");
    const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
    const cookie = (req.cookies as Record<string, string | undefined> | undefined)?.[SESSION_COOKIE];
    const token = bearer ?? cookie;
    const actor = token ? await tokens.verify(token) : null;
    req.actor = actor && (await sessions.isCurrent(actor)) ? actor : null;
    next();
  };
}

/**
 * CSRF defence for cookie sessions: state-changing requests must be JSON (or have
 * no body). A cross-site HTML form cannot send application/json without a CORS
 * preflight, and the session cookie is SameSite=Lax on top of that.
 */
export const requireJsonForWrites: RequestHandler = (req, res, next) => {
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const hasBody = Number(req.header("content-length") ?? 0) > 0 || req.header("transfer-encoding");
  if (isWrite && hasBody && !req.is("application/json")) {
    res.status(415).json({ error: { code: "VALIDATION_FAILED", message: "Send JSON (application/json)" } });
    return;
  }
  next();
};
