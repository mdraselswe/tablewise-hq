import { rateLimit } from "express-rate-limit";
import { ErrorCode, LoginRequest } from "@tablewise/contracts";
import { route, type RouteDefinition } from "@/platform/http/route.ts";
import type { IdentityController } from "./identity.controller.ts";

/** Slows down password guessing: 10 attempts per IP per 5 minutes. */
const loginLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: "Too many sign-in attempts. Try again in a few minutes.",
      },
    });
  },
});

export function identityRoutes(
  controller: IdentityController,
  options: { rateLimit: boolean },
): RouteDefinition[] {
  return [
    route({
      method: "post",
      path: "/auth/login",
      summary: "Sign in",
      description: "Sets an httpOnly session cookie and also returns the token for API clients (Bearer).",
      public: true,
      body: LoginRequest,
      successStatus: 200,
      middleware: options.rateLimit ? [loginLimiter] : [],
      handler: controller.login,
    }),
    route({
      method: "post",
      path: "/auth/logout",
      summary: "Sign out",
      public: true,
      successStatus: 204,
      handler: controller.logout,
    }),
    route({
      method: "get",
      path: "/auth/me",
      summary: "Current user",
      handler: controller.me,
    }),
  ];
}
