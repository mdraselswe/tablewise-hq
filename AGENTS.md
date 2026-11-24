# Working on Tablewise HQ

Guidance for contributors and coding agents. Read [README.md](README.md) for what the system does and [docs/architecture.md](docs/architecture.md) for why it is built this way.

## Commands

| Command        | Use                                                                     |
| -------------- | ----------------------------------------------------------------------- |
| `pnpm install` | Install (pnpm via Corepack, Node 24)                                    |
| `pnpm db:up`   | PostgreSQL 18 in Docker on host port 5433                               |
| `pnpm db:seed` | Migrate and seed demo data                                              |
| `pnpm dev`     | API on :4000 and web on :5173                                           |
| `pnpm test`    | Integration and unit tests against the `tablewise_test` database        |
| `pnpm check`   | Typecheck, lint, format check, tests, build. Must pass before a commit. |

## Repository layout

- `apps/api` Express 5 API. `src/platform` is business-agnostic infrastructure; `src/modules/<name>` holds the business modules; `src/container.ts` is the composition root.
- `apps/web` React 19 + Vite single-page app.
- `packages/contracts` zod schemas and types shared by API and web. Source only, no build step.

## Rules that keep the architecture intact

1. **A module never imports another module.** If a service needs something from another module, declare a port interface in the service and wire the other module's `api` to it in `src/container.ts`. ESLint enforces this.
2. **Platform code never imports a module.**
3. **One module, one schema.** Only a module's repository queries its schema. Reporting reads only its own projection tables.
4. **Layers:** routes are data (`route({...})`), controllers translate HTTP to a service call, services hold business rules and transactions, repositories hold SQL. No SQL outside repositories, no HTTP types outside controllers and routes.
5. **Side effects after commit are events.** Publish with `outbox.publish()` inside the same transaction as the change. Consumers subscribe with a unique consumer name and must be idempotent (the inbox handles redelivery).
6. **Read `process.env` only in `src/config/env.ts`.** Add new variables to the zod schema and to `.env.example`.
7. **New request or response shapes go in `packages/contracts`** so the web app gets the same types.

## Database

- Migrations are plain SQL in `apps/api/migrations`, numbered `NNNN_name.sql`. Never edit an applied migration (checksums are verified); add a new one.
- Name every constraint explicitly and, if users can hit it, add a friendly message in `CONSTRAINT_MESSAGES` (`src/platform/http/error-handler.ts`).
- Money is an integer in minor units. Never use floating point for money.
- Lock rows in a consistent order (by id) when a transaction locks more than one.
- Every new query path that filters or sorts large tables needs an index; say which query it serves in the migration comment.

## Tests

- Tests that prove data guarantees run against real PostgreSQL through HTTP (`apps/api/test`). Use `createTestContext`, `truncateAll` and `createFixture` from `test/helpers.ts`.
- Pure functions get unit tests next to the source (`*.test.ts`).
- When fixing a bug, add a test that fails without the fix.

## Code style

- TypeScript strict with `noUncheckedIndexedAccess`; no `any`, no non-null assertions.
- Prettier formats, ESLint lints; both run on staged files in the pre-commit hook.
- Comments explain why, not what.
- All code, comments, docs and UI text are in English.

## Commits

- Conventional Commits, enforced by commitlint: `type(scope): summary`, header at most 100 characters. Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`. Common scopes: `api`, `web`, `contracts`, `db`, `docs`, `deps`.
- One logical change per commit; `pnpm check` passes on every commit.
