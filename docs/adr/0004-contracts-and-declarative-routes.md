# ADR 0004: Shared zod contracts and declarative routes

- Status: accepted
- Date: 2026-11-24

## Context

The API needs request validation, typed controllers, consistent errors and documentation. The React app needs the same request and response types. Keeping four copies of the same shape (validator, server type, client type, docs) in sync by hand is how integrations break.

## Decision

- Put every request schema (zod 4), response type, error code and event payload in `packages/contracts`, consumed as TypeScript source by both apps.
- Declare each endpoint once with `route({ method, path, summary, roles | public | outletParam, params, query, body, headers, handler })`. From that object the platform mounts the Express route, runs the auth guard, validates input into `req.validated`, types the controller's context, and generates the OpenAPI 3.1 document (`/api/openapi.json`, browsable at `/api/docs`).

## Alternatives considered

- **Hand-written OpenAPI plus a code generator.** Two sources of truth; the YAML drifts from the code.
- **Decorator-based frameworks (NestJS, tsoa).** Capable, but heavy for this scope and the brief asks for Express.
- **tRPC.** Excellent type sharing, but it is not a conventional REST API, which external clients and the brief expect.

## Consequences

- Changing a schema changes validation, types, the web client's types and the docs in one commit; a mismatch fails `pnpm typecheck`.
- Access rules are visible next to each path, which makes authorisation review easy.
- The contracts package must stay free of server-only code, because the browser bundles it.
