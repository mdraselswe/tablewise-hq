import type { CookieOptions } from "express";
import type { LoginRequest, LoginResponse } from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import { SESSION_COOKIE } from "@/platform/http/middleware.ts";
import { type HttpContext, type HttpReply, noContent, ok } from "@/platform/http/route.ts";
import type { IdentityService } from "./identity.service.ts";

export class IdentityController {
  readonly #cookie: CookieOptions;

  constructor(
    private readonly service: IdentityService,
    options: { secureCookies: boolean },
  ) {
    this.#cookie = { httpOnly: true, sameSite: "lax", secure: options.secureCookies, path: "/" };
  }

  login = async ({
    body,
    res,
  }: HttpContext<unknown, unknown, LoginRequest, Actor | null>): Promise<HttpReply> => {
    const { user, session } = await this.service.login(body);
    res.cookie(SESSION_COOKIE, session.token, { ...this.#cookie, expires: session.expiresAt });
    const response: LoginResponse = {
      user,
      accessToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    };
    return ok(response);
  };

  logout = async ({ res }: HttpContext<unknown, unknown, undefined, Actor | null>): Promise<HttpReply> => {
    res.clearCookie(SESSION_COOKIE, this.#cookie);
    return noContent();
  };

  me = async ({ actor }: HttpContext<unknown, unknown, undefined, Actor>): Promise<HttpReply> =>
    ok(await this.service.me(actor));
}
