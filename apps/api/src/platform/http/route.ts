import type { Request, RequestHandler, Response, Router } from "express";
import type { z } from "zod";
import type { Role, ValidationIssue } from "@tablewise/contracts";
import type { Actor } from "@/platform/auth/actor.ts";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "./errors.ts";

/**
 * Routes are declared as data: method, path, access rule, zod schemas and a handler.
 *
 * One declaration drives three things, so they can never drift apart:
 *   1. the Express route (auth guard -> validation -> controller),
 *   2. the OpenAPI document served at /api/docs,
 *   3. the TypeScript types the controller receives.
 */
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface HttpReply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export const ok = (body: unknown, headers?: Record<string, string>): HttpReply => ({
  status: 200,
  body,
  ...(headers ? { headers } : {}),
});
export const created = (body: unknown, headers?: Record<string, string>): HttpReply => ({
  status: 201,
  body,
  ...(headers ? { headers } : {}),
});
export const noContent = (): HttpReply => ({ status: 204 });

export interface HttpContext<P, Q, B, A> {
  params: P;
  query: Q;
  body: B;
  actor: A;
  req: Request;
  res: Response;
}

type Output<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  summary: string;
  description: string | undefined;
  isPublic: boolean;
  roles: readonly Role[] | undefined;
  outletParam: string | undefined;
  successStatus: number;
  schemas: { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType; headers?: z.ZodType };
  middleware: RequestHandler[];
  handle: (req: Request, res: Response) => Promise<HttpReply>;
}

interface RouteSpec<
  P extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
  B extends z.ZodType | undefined,
  Public extends boolean,
> {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  /** Public routes skip authentication (login, health). Everything else requires a session. */
  public?: Public;
  /** Restrict to these roles. Omit to allow any signed-in user. */
  roles?: readonly Role[];
  /** Path parameter holding an outlet id: outlet staff may only use their own. */
  outletParam?: string;
  params?: P;
  query?: Q;
  body?: B;
  /** Documented request headers (validated, e.g. Idempotency-Key). */
  headers?: z.ZodType;
  successStatus?: number;
  middleware?: RequestHandler[];
  handler: (
    context: HttpContext<Output<P>, Output<Q>, Output<B>, Public extends true ? Actor | null : Actor>,
  ) => Promise<HttpReply>;
}

export function route<
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
  Public extends boolean = false,
>(spec: RouteSpec<P, Q, B, Public>): RouteDefinition {
  return {
    method: spec.method,
    path: spec.path,
    summary: spec.summary,
    description: spec.description,
    isPublic: spec.public === true,
    roles: spec.roles,
    outletParam: spec.outletParam,
    successStatus: spec.successStatus ?? (spec.method === "post" ? 201 : 200),
    schemas: {
      ...(spec.params ? { params: spec.params } : {}),
      ...(spec.query ? { query: spec.query } : {}),
      ...(spec.body ? { body: spec.body } : {}),
      ...(spec.headers ? { headers: spec.headers } : {}),
    },
    middleware: spec.middleware ?? [],
    handle: (req, res) =>
      spec.handler({
        params: req.validated.params as Output<P>,
        query: req.validated.query as Output<Q>,
        body: req.validated.body as Output<B>,
        actor: req.actor as Public extends true ? Actor | null : Actor,
        req,
        res,
      }),
  };
}

function guard(definition: RouteDefinition): RequestHandler {
  return (req, _res, next) => {
    if (definition.isPublic) return next();
    const actor = req.actor;
    if (!actor) throw new UnauthenticatedError();
    if (definition.roles && !definition.roles.includes(actor.role)) {
      throw new ForbiddenError("Your role cannot perform this action");
    }
    if (definition.outletParam && actor.role !== "HQ_ADMIN") {
      // Runs before validation, so compare case-insensitively like PostgreSQL does for UUIDs.
      const param = req.params[definition.outletParam];
      const outletId = typeof param === "string" ? param.toLowerCase() : undefined;
      if (outletId !== actor.outletId) throw new ForbiddenError("You can only access your own outlet");
    }
    next();
  };
}

function validator(definition: RouteDefinition): RequestHandler {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];
    const parse = (part: "params" | "query" | "body" | "headers", input: unknown): unknown => {
      const schema = definition.schemas[part];
      if (!schema) return part === "body" ? undefined : {};
      const result = schema.safeParse(input);
      if (result.success) return result.data;
      for (const issue of result.error.issues) {
        issues.push({ path: [part, ...issue.path.map(String)].join("."), message: issue.message });
      }
      return undefined;
    };
    const validated = {
      params: parse("params", req.params),
      query: parse("query", req.query),
      body: parse("body", req.body),
    };
    parse("headers", req.headers);
    if (issues.length > 0) throw new ValidationError(issues);
    req.validated = validated;
    next();
  };
}

export function mountRoutes(router: Router, definitions: readonly RouteDefinition[]): void {
  for (const definition of definitions) {
    router[definition.method](
      definition.path,
      ...definition.middleware,
      guard(definition),
      validator(definition),
      async (req: Request, res: Response) => {
        const reply = await definition.handle(req, res);
        for (const [name, value] of Object.entries(reply.headers ?? {})) res.setHeader(name, value);
        res.status(reply.status);
        if (reply.body === undefined) res.end();
        else res.json(reply.body);
      },
    );
  }
}
