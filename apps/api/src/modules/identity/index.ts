import type { TokenService } from "@/platform/auth/token-service.ts";
import type { Database } from "@/platform/db/database.ts";
import type { ModuleDefinition } from "@/platform/module.ts";
import { IdentityController } from "./identity.controller.ts";
import { IdentityRepository } from "./identity.repository.ts";
import { identityRoutes } from "./identity.routes.ts";
import { IdentityService } from "./identity.service.ts";

export type IdentityApi = Pick<IdentityService, "createUser">;

export function createIdentityModule(deps: {
  db: Database;
  tokens: TokenService;
  secureCookies: boolean;
  rateLimitLogin: boolean;
}): { module: ModuleDefinition; api: IdentityApi } {
  const service = new IdentityService(new IdentityRepository(deps.db), deps.tokens);
  const controller = new IdentityController(service, { secureCookies: deps.secureCookies });
  return {
    module: {
      name: "Identity",
      description: "Sign-in and sessions. HQ admins manage every outlet; outlet staff work in one outlet.",
      routes: identityRoutes(controller, { rateLimit: deps.rateLimitLogin }),
    },
    api: service,
  };
}
