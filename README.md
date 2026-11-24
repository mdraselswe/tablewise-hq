# Tablewise HQ

A multi-outlet food and beverage platform. HQ owns the master menu, decides which outlet sells which item at what price, and watches sales across every outlet live. Each outlet runs a POS that records sales, deducts its own stock and feeds a kitchen display.

**Single company -> many outlets -> HQ assigns the menu -> outlets sell -> HQ sees reports.**

- **Live demo: https://tablewise-hq.onrender.com** (free instance: the first visit after 15 idle minutes takes up to a minute to wake). Demo accounts are listed [below](#demo-accounts).
- API reference (generated from the code): `/api/docs`, raw OpenAPI 3.1 at `/api/openapi.json`
- Architecture, ERD, scaling plan, microservices path and offline POS strategy: [docs/architecture.md](docs/architecture.md)
- Decision records: [docs/adr/](docs/adr/)

---

## Contents

1. [Features](#features)
2. [Tech stack and why](#tech-stack-and-why)
3. [Getting started](#getting-started)
4. [Demo accounts](#demo-accounts)
5. [API endpoints](#api-endpoints)
6. [Database schema](#database-schema)
7. [Architecture](#architecture)
8. [How a sale works](#how-a-sale-works)
9. [Scaling strategy](#scaling-strategy)
10. [Testing](#testing)
11. [Frontend](#frontend)
12. [Deployment](#deployment)
13. [Project structure](#project-structure)

---

## Features

### Brief requirements

| Requirement                               | How it is met                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HQ creates master menu items              | `POST /api/v1/menu-items` (HQ only). SKU is unique (`menu_items_sku_key`).                                                                                        |
| HQ assigns items to specific outlets      | `PUT /api/v1/outlets/:outletId/assignments/:menuItemId`, an idempotent upsert into `catalog.outlet_menu_items`.                                                   |
| HQ overrides the price per outlet         | `priceOverrideMinor` on the assignment. `null` clears it. Effective price = `COALESCE(override, base)`.                                                           |
| Outlet retrieves only its assigned items  | `GET /api/v1/outlets/:outletId/menu` returns assigned, available and active items at the outlet's effective price. Outlet staff cannot read another outlet (403). |
| Stock tracked per outlet                  | `inventory.stock_levels` keyed by `(outlet_id, menu_item_id)`.                                                                                                    |
| Sales deduct outlet stock                 | The sale transaction locks and decrements the outlet's stock rows and writes one audit row per line.                                                              |
| Negative stock is impossible              | Checked in code (all shortfalls reported at once), enforced again by `CHECK (on_hand >= 0)` in the database.                                                      |
| Sale with multiple items                  | `POST /api/v1/outlets/:outletId/sales` with up to 100 lines; repeated items are merged.                                                                           |
| Sequential receipt number per outlet      | Per-outlet counter row in `sales.receipt_sequences`, formatted `CODE-000042`. Gap-free, because a rolled-back sale rolls back its increment too.                  |
| Receipt correct under concurrent requests | The counter row lock is held until commit; `UNIQUE (outlet_id, receipt_seq)` is the backstop. Proven by a test that fires 40 parallel sales.                      |
| Wrapped in a database transaction         | One transaction covers idempotency check, pricing, stock deduction, receipt number, sale, lines and the outbox event.                                             |
| Total revenue by outlet                   | `GET /api/v1/reports/revenue`                                                                                                                                     |
| Top 5 selling items per outlet            | `GET /api/v1/reports/top-items` (default `limit=5`, ranked with `ROW_NUMBER() OVER (PARTITION BY outlet_id ...)`).                                                |

### Beyond the brief

- **Live dashboard.** Sales, stock changes and kitchen updates are pushed to browsers over Server-Sent Events. Works across many API instances via PostgreSQL `LISTEN/NOTIFY`.
- **Kitchen Display System (KDS).** Every fresh sale becomes a ticket on its outlet's board: `NEW -> PREPARING -> READY -> SERVED`, with one step back allowed.
- **Stock audit trail.** Every stock change (opening stock, sale, restock, adjustment, waste) records the delta, resulting balance, who did it and which sale caused it.
- **Idempotency keys.** Retrying a sale with the same `Idempotency-Key` returns the original sale instead of charging twice. This is also the base of the offline POS sync strategy.
- **Generated API reference.** Every route is declared once as data; the same declaration drives Express, validation, TypeScript types and the OpenAPI document.
- **Command palette** (Ctrl/Cmd + K), light and dark themes, keyboard-friendly POS.

---

## Tech stack and why

| Layer               | Choice                                            | Why                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database            | PostgreSQL 18                                     | Required by the brief, and the right tool: row locks, `CHECK` constraints, partial and GIN indexes, `FOR UPDATE SKIP LOCKED` for the outbox relay, advisory locks, `LISTEN/NOTIFY` for realtime fan-out, window functions for ranking. |
| Runtime             | Node.js 24 LTS                                    | Required stack. Current LTS with built-in `--env-file`, `AsyncLocalStorage` and `scrypt`, so fewer dependencies.                                                                                                                       |
| HTTP                | Express 5                                         | Required stack. Version 5 forwards rejected promises to the error middleware natively, so async handlers need no wrappers.                                                                                                             |
| Language            | TypeScript 6, strict + `noUncheckedIndexedAccess` | Catches whole classes of bugs at compile time. Shared types between API and web remove a class of integration bugs.                                                                                                                    |
| Contracts           | zod 4 in `packages/contracts`                     | One schema per request validates input on the server, types the controller, types the web client and generates the OpenAPI document. The API and the UI cannot drift apart.                                                            |
| Data access         | `pg` with hand-written SQL, no ORM                | The core of this system is concurrency control (`FOR UPDATE`, lock ordering, upserts, `unnest` batch inserts, `SKIP LOCKED`). Raw SQL keeps those explicit and reviewable; an ORM would hide them. Repositories keep SQL in one layer. |
| Migrations          | Plain SQL files + a 100-line runner               | Readable DDL, checksum protection against edited migrations, advisory lock so several instances can boot at once.                                                                                                                      |
| Auth tokens         | `jose` (HS256 JWT) in an httpOnly cookie          | Stateless: any instance (or a future auth service) can verify a token without a session store. httpOnly keeps it away from page scripts; a Bearer header is accepted for API clients.                                                  |
| Passwords           | Node's built-in `scrypt`                          | Memory-hard, no native add-on to compile, no extra dependency. Cost parameters are stored with each hash so they can be raised later.                                                                                                  |
| Logging             | `pino` + `pino-http`                              | Structured JSON logs with request ids, ready for any log pipeline; secrets (cookies, authorization, passwords) are redacted.                                                                                                           |
| Security middleware | `helmet`, `express-rate-limit`                    | Sensible security headers and CSP; login is limited to 10 failed attempts per IP per 5 minutes.                                                                                                                                        |
| Frontend            | React 19 + Vite                                   | Required stack (React). Vite gives instant dev reloads and fingerprinted, code-split production assets.                                                                                                                                |
| UI                  | Tailwind CSS 4 + shadcn/ui on Base UI             | Accessible primitives (focus, keyboard, ARIA) that we own as source, styled with design tokens so the whole app shares one look in light and dark.                                                                                     |
| Server state        | TanStack Query                                    | Caching, background refresh and precise invalidation, which pairs naturally with realtime events ("a sale happened, refresh these queries").                                                                                           |
| Motion              | `motion`                                          | Layout animations (cart lines, kitchen cards moving between columns) that respect reduced-motion settings.                                                                                                                             |
| Tests               | Vitest + Supertest against real PostgreSQL        | The guarantees that matter (no overselling, gap-free receipts, idempotency) only exist in the database. Mocks cannot prove them; parallel HTTP requests against a real database can.                                                   |
| Monorepo            | pnpm workspaces                                   | API, web and contracts in one repo with one lockfile; strict dependency isolation; exact versions and a one-day minimum release age as supply-chain safety.                                                                            |
| Quality gates       | ESLint, Prettier, Husky, lint-staged, commitlint  | Formatting and lint on every commit, Conventional Commits enforced, module boundaries enforced by lint rules.                                                                                                                          |
| Packaging           | Docker (multi-stage) + docker-compose             | Same image locally and in production; compose brings up PostgreSQL plus the app with one command.                                                                                                                                      |
| Hosting             | Render (Docker web service) + Neon (PostgreSQL)   | Render deploys the Docker image from GitHub and provides TLS; Neon is managed serverless PostgreSQL that does not expire on the free plan. No servers to run. A single container serves both the API and the built web app.            |

---

## Getting started

### Prerequisites

- Node.js 24 (`.nvmrc`)
- pnpm via Corepack: `corepack enable`
- Docker (for PostgreSQL)

### Run locally

```bash
cp .env.example .env       # local defaults, validated at startup
pnpm install
pnpm db:up                 # PostgreSQL 18 in Docker on host port 5433
pnpm db:seed               # migrations + demo data (4 outlets, 32 items, 14 days of sales)
pnpm dev                   # API on http://localhost:4000, web on http://localhost:5173
```

The web dev server proxies `/api` to the API, so the browser sees one origin and the session cookie just works.

### Useful commands

| Command                     | What it does                                                                     |
| --------------------------- | -------------------------------------------------------------------------------- |
| `pnpm dev`                  | API (watch mode) and web dev server in parallel                                  |
| `pnpm test`                 | Unit and integration tests (needs `pnpm db:up`; uses the `tablewise_test` DB)    |
| `pnpm check`                | Typecheck, lint, format check, tests and build. Run before every commit.         |
| `pnpm db:migrate`           | Apply pending migrations                                                         |
| `pnpm db:seed`              | Apply migrations, then seed demo data if the database is empty                   |
| `pnpm db:reset`             | Drop every schema, migrate and seed again (refuses in production)                |
| `docker compose up --build` | PostgreSQL + the production image on http://localhost:8080, seeded on first boot |

### Configuration

Every variable is listed in [.env.example](.env.example) and validated by `apps/api/src/config/env.ts`; the process refuses to start with a clear message if one is wrong. The most important ones:

| Variable            | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string                                              |
| `JWT_SECRET`        | Session signing key, at least 32 characters                               |
| `TRUST_PROXY`       | Set behind a reverse proxy so secure cookies and client IPs work          |
| `COOKIE_SECURE`     | Force the Secure cookie flag (defaults to on in production)               |
| `BUSINESS_TIMEZONE` | Time zone that defines "today" for report defaults (default `Asia/Dhaka`) |
| `MIGRATE_ON_BOOT`   | Apply migrations at startup (default `true`, safe with many instances)    |
| `SEED_DEMO_DATA`    | Seed demo data when the database is empty                                 |
| `WEB_DIST_DIR`      | Serve the built web app from this folder (single-container deploy)        |

---

## Demo accounts

Password for every account: `Tablewise#2026`

| Email                     | Role         | Outlet          |
| ------------------------- | ------------ | --------------- |
| `hq@tablewise.app`        | HQ admin     | All outlets     |
| `gulshan@tablewise.app`   | Outlet staff | Gulshan (GUL)   |
| `dhanmondi@tablewise.app` | Outlet staff | Dhanmondi (DHN) |
| `uttara@tablewise.app`    | Outlet staff | Uttara (UTT)    |
| `banani@tablewise.app`    | Outlet staff | Banani (BNN)    |

The seed goes through the real module APIs, so stock movements, receipt numbers, kitchen tickets and report projections are exactly what production code produces. A fixed random seed makes every fresh demo identical. A few items are deliberately left low on stock so alerts have something to show, and a few orders from the last 25 minutes appear on each kitchen board.

---

## API endpoints

All business endpoints live under `/api/v1`. The interactive reference at `/api/docs` is generated from the same route declarations listed here.

**Who can call it:** _Public_ = no session. _Any_ = any signed-in user. _HQ_ = `HQ_ADMIN`. _Outlet_ = `OUTLET_STAFF`. _Scoped_ = HQ for any outlet, outlet staff only for their own outlet (403 otherwise).

### Identity

| Method | Path           | Who    | Purpose                                                                             |
| ------ | -------------- | ------ | ----------------------------------------------------------------------------------- |
| POST   | `/auth/login`  | Public | Sign in. Sets the httpOnly `tw_session` cookie and returns the token. Rate limited. |
| POST   | `/auth/logout` | Public | Clears the session cookie (204).                                                    |
| GET    | `/auth/me`     | Any    | The current user.                                                                   |

### Outlets

| Method | Path                 | Who    | Purpose                                                     |
| ------ | -------------------- | ------ | ----------------------------------------------------------- |
| GET    | `/outlets`           | Any    | HQ sees every outlet; outlet staff see only their own.      |
| POST   | `/outlets`           | HQ     | Create an outlet (code is immutable: it prefixes receipts). |
| GET    | `/outlets/:outletId` | Scoped | Get one outlet.                                             |
| PATCH  | `/outlets/:outletId` | HQ     | Rename, move, change time zone or deactivate an outlet.     |

### Catalog (master menu, assignments, prices)

| Method | Path                                         | Who    | Purpose                                                                                                                                     |
| ------ | -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/menu-items`                                | HQ     | List master items. `search` (name or SKU), `category`, `status=active\|inactive\|all`, pagination.                                          |
| GET    | `/menu-items/categories`                     | Any    | Distinct categories.                                                                                                                        |
| POST   | `/menu-items`                                | HQ     | Create a master item.                                                                                                                       |
| GET    | `/menu-items/:menuItemId`                    | HQ     | Get a master item.                                                                                                                          |
| PATCH  | `/menu-items/:menuItemId`                    | HQ     | Update; `isActive: false` removes it from every outlet's sellable menu at once.                                                             |
| GET    | `/menu-items/:menuItemId/assignments`        | HQ     | Which outlets sell this item and at what price.                                                                                             |
| GET    | `/outlets/:outletId/assignments`             | Scoped | Every item assigned to an outlet, with base, override and effective price and availability (read-only for outlet staff).                    |
| PUT    | `/outlets/:outletId/assignments/:menuItemId` | HQ     | Assign an item or change its outlet price/availability. 201 when newly assigned, 200 otherwise. `openingStock` applies on first assignment. |
| DELETE | `/outlets/:outletId/assignments/:menuItemId` | HQ     | Remove an item from an outlet (its stock level goes with it; the audit trail stays).                                                        |
| GET    | `/outlets/:outletId/menu`                    | Scoped | The outlet's sellable menu at effective prices. This is what the POS loads.                                                                 |

### Inventory

| Method | Path                                                   | Who    | Purpose                                                                                                                  |
| ------ | ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/outlets/:outletId/inventory`                         | Scoped | Stock levels, low-stock threshold and `isLow` flag.                                                                      |
| POST   | `/outlets/:outletId/inventory/:menuItemId/adjustments` | Scoped | `RESTOCK` (delta > 0), `WASTE` (delta < 0) or `ADJUSTMENT`. Fails with `INSUFFICIENT_STOCK` instead of going below zero. |
| PATCH  | `/outlets/:outletId/inventory/:menuItemId`             | Scoped | Change the low-stock alert threshold.                                                                                    |
| GET    | `/outlets/:outletId/inventory/movements`               | Scoped | Audit trail, newest first. Filter by `menuItemId` and `reason`; paginated.                                               |

### Sales

| Method | Path                       | Who                | Purpose                                                                                                                   |
| ------ | -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/outlets/:outletId/sales` | Outlet, own outlet | Record a sale atomically (see [How a sale works](#how-a-sale-works)). Optional `Idempotency-Key` header (UUID).           |
| GET    | `/sales`                   | Any                | Sales newest first. HQ may filter by `outletId`; staff always get their own outlet. `from`/`to` trading days, pagination. |
| GET    | `/sales/:saleId`           | Any                | One sale with its lines (the receipt). Another outlet's sale returns 404.                                                 |

### Kitchen

| Method | Path                                 | Who    | Purpose                                                                                                                 |
| ------ | ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/outlets/:outletId/kitchen/tickets` | Scoped | Open tickets oldest first (`scope=active`), or include served ones from the last 24 hours (`scope=all`).                |
| PATCH  | `/kitchen/tickets/:ticketId`         | Any    | Bump or recall a ticket. Disallowed moves return `INVALID_STATE_TRANSITION` (409). Another outlet's ticket returns 404. |

### Reporting

| Method | Path                     | Who | Purpose                                                                                     |
| ------ | ------------------------ | --- | ------------------------------------------------------------------------------------------- |
| GET    | `/reports/revenue`       | Any | Revenue, sale count, items sold and average ticket per outlet, plus totals. Default: today. |
| GET    | `/reports/top-items`     | Any | Top items by quantity per outlet. `limit` 1 to 20, default 5. Default: today.               |
| GET    | `/reports/revenue-trend` | Any | One zero-filled point per day. Default: the last 14 days.                                   |

`from` and `to` are trading days (`YYYY-MM-DD`). HQ may pass `outletId`; outlet staff are always scoped to their own outlet. A report covers at most 366 days.

### Realtime, health and docs

| Method | Path                | Who    | Purpose                                                                                                                                                               |
| ------ | ------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/stream`    | Any    | Server-Sent Events: `sales.sale.completed`, `inventory.stock.changed`, `kitchen.ticket.changed`, `outlets.outlet.upserted`, filtered to the outlets the user may see. |
| GET    | `/health/live`      | Public | Liveness (process is up).                                                                                                                                             |
| GET    | `/health/ready`     | Public | Readiness (database reachable).                                                                                                                                       |
| GET    | `/api/openapi.json` | Public | OpenAPI 3.1 document.                                                                                                                                                 |
| GET    | `/api/docs`         | Public | Interactive API reference.                                                                                                                                            |

### Conventions

- **Errors** always have one shape, and clients branch on `code`, never on `message`:

  ```json
  {
    "error": {
      "code": "INSUFFICIENT_STOCK",
      "message": "Not enough stock to complete this request",
      "details": { "shortfalls": [{ "menuItemId": "...", "requested": 3, "available": 1 }] },
      "requestId": "6f1c..."
    }
  }
  ```

  Codes: `VALIDATION_FAILED` (400, with every issue and its path), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409, e.g. duplicate SKU), `INSUFFICIENT_STOCK` (409), `OUTLET_INACTIVE` (409), `INVALID_STATE_TRANSITION` (409), `ITEMS_NOT_SELLABLE` (422), `RATE_LIMITED` (429), `INTERNAL` (500, message never leaked). Database constraint violations are translated into these codes with friendly messages.

- **Money** is always an integer in minor units (poisha): `12550` means BDT 125.50. Integers keep sums exact.
- **Idempotency.** Send `Idempotency-Key: <uuid>` on `POST /sales`. A retry with the same key returns the original sale with status 200 and `Idempotent-Replayed: true`.
- **Pagination.** `page` (from 1) and `pageSize` (1 to 100, default 20); responses are `{ items, page, pageSize, total }`.
- **Request ids.** Every response carries `X-Request-Id`; send your own to trace a call across services.
- **Writes must be JSON.** State-changing requests with a body must be `application/json` (CSRF defence for cookie sessions).

---

## Database schema

Each module owns one PostgreSQL schema, and only that module's repository queries it. This keeps every module extractable into its own database later (see [ADR 0001](docs/adr/0001-modular-monolith.md)). The full ERD is in [docs/architecture.md](docs/architecture.md#entity-relationship-diagram).

| Schema      | Table                                                        | Purpose and key rules                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outlets`   | `outlets`                                                    | Branches. `code` unique and `^[A-Z0-9]{2,8}$` (receipt prefix). Time zone per outlet.                                                                                                                                                                            |
| `identity`  | `users`                                                      | Email unique and lowercase. `CHECK`: HQ admins have no outlet, outlet staff have exactly one (FK to `outlets.outlets`).                                                                                                                                          |
| `catalog`   | `menu_items`                                                 | Master menu. `sku` unique; `base_price_minor >= 0`. Index on `(category, name)` for menu lists; trigram GIN index for "contains" search on name and SKU.                                                                                                         |
| `catalog`   | `outlet_menu_items`                                          | Assignment of an item to an outlet. PK `(outlet_id, menu_item_id)` (also serves "menu of outlet X"); nullable `price_override_minor >= 0`; `is_available`. Index on `menu_item_id` for "which outlets sell Y".                                                   |
| `inventory` | `stock_levels`                                               | PK `(outlet_id, menu_item_id)`; composite FK to the assignment (stock exists only for assigned items); `CHECK (on_hand >= 0)` as the last line of defence; low-stock threshold.                                                                                  |
| `inventory` | `stock_movements`                                            | Append-only audit trail: delta, balance after, reason, reference (sale), actor. Indexed by outlet + time, by outlet + item + time, and by reference.                                                                                                             |
| `sales`     | `receipt_sequences`                                          | One counter row per outlet; its row lock serialises numbering per outlet only.                                                                                                                                                                                   |
| `sales`     | `sales`                                                      | `UNIQUE (outlet_id, receipt_seq)`, `UNIQUE (receipt_no)`, `UNIQUE (outlet_id, idempotency_key)`. Stores `occurred_at` (till time), `business_date` (trading day in the outlet's time zone) and `created_at`. Indexed by outlet + trading day and by trading day. |
| `sales`     | `sale_lines`                                                 | PK `(sale_id, line_no)`; `UNIQUE (sale_id, menu_item_id)`; name, SKU and unit price are snapshots so menu edits never rewrite history; `CHECK (line_total = unit_price * quantity)`.                                                                             |
| `kitchen`   | `tickets`, `ticket_items`                                    | One ticket per sale (`UNIQUE (sale_id)`), status `CHECK`, partial index on open tickets so the served backlog never slows the board.                                                                                                                             |
| `reporting` | `outlet_directory`, `daily_outlet_sales`, `daily_item_sales` | Read models built from events. No foreign keys on purpose: reporting knows only what events told it, so it can move to a replica or warehouse unchanged. Pre-aggregated per day.                                                                                 |
| `platform`  | `outbox_events`                                              | Transactional outbox. Partial index on unpublished rows keeps the relay's scan tiny.                                                                                                                                                                             |
| `platform`  | `inbox`                                                      | PK `(consumer, event_id)`: makes every consumer idempotent.                                                                                                                                                                                                      |
| `platform`  | `schema_migrations`                                          | Applied migrations with checksums.                                                                                                                                                                                                                               |

Constraints are named explicitly in the migrations, so the API maps each violation to a stable, friendly error (for example `menu_items_sku_key` -> "A menu item with this SKU already exists").

---

## Architecture

```text
HTTP request
   |
   v
routes (declared as data: method, path, access rule, zod schemas)
   |  auth guard -> validation
   v
controllers (HTTP <-> service call, no business rules)
   |
   v
services (business rules, transaction boundaries, ports to other modules)
   |
   v
repositories (SQL only, one module's schema only)
   |
   v
PostgreSQL
```

- **Platform vs modules.** `apps/api/src/platform` holds business-agnostic infrastructure: the database wrapper, migrator, HTTP routing and errors, auth, the outbox, event bus and realtime gateway. `apps/api/src/modules` holds seven business modules: `identity`, `outlets`, `catalog`, `inventory`, `sales`, `kitchen`, `reporting`. Platform code may never import a module (ESLint enforces it).
- **Ports and the composition root.** A module never imports another module. When Sales needs prices and stock, its service declares `SalesCatalogPort` and `SalesInventoryPort` interfaces; `src/container.ts`, the only file that knows every module, plugs in the other modules' public `api` objects. Extracting a module into a service means replacing its `api` there with an HTTP or gRPC client; no caller changes.
- **Ambient transactions.** `Database.transaction()` stores the transaction's client in `AsyncLocalStorage`. Every query issued while it runs, in any repository of any module, joins that transaction automatically. That is how one sale spans Catalog, Inventory and Sales atomically without passing a client through every function.
- **Transactional outbox.** State changes and their integration events are written in the same transaction (`platform.outbox_events`), so an event exists if and only if the change committed. A relay delivers events to subscribers after commit; an inbox makes each consumer process each event once.
- **Projections (CQRS).** Reporting and Kitchen build their own tables from events. Reports read pre-aggregated daily rows, not the sales table.
- **Realtime.** The relay forwards selected events to `pg_notify`; every API instance `LISTEN`s and pushes them to its own SSE clients, filtered by outlet access. No Redis needed for multi-instance fan-out.
- **Routes as data.** One `route({...})` declaration produces the Express route, the auth guard, validation, the controller's TypeScript types and the OpenAPI entry.

Details, diagrams and the reasoning behind each choice: [docs/architecture.md](docs/architecture.md) and [docs/adr/](docs/adr/).

---

## How a sale works

`POST /api/v1/outlets/:outletId/sales` (`SalesService.createSale`), all inside one database transaction:

1. **Normalise lines.** Repeated items are merged and lines are sorted by `menu_item_id`, which fixes the lock order.
2. **Idempotency.** With an `Idempotency-Key`, take a transaction-scoped advisory lock on `(outlet, key)`. A concurrent retry waits here, then finds the committed sale and returns it (200, `Idempotent-Replayed: true`).
3. **Outlet may trade.** Inactive outlets are refused (`OUTLET_INACTIVE`).
4. **Price the lines.** Catalog returns only items assigned to the outlet, available and active, at the effective price. Anything else fails with `ITEMS_NOT_SELLABLE`.
5. **Lock and deduct stock.** Inventory locks the stock rows with `SELECT ... FOR UPDATE ORDER BY menu_item_id`, checks every line, and fails with all shortfalls at once (`INSUFFICIENT_STOCK`). Otherwise it applies all deltas in one statement and writes one audit row per line. `CHECK (on_hand >= 0)` backs this up.
6. **Next receipt number.** Upsert-increment the outlet's counter row. It is taken last so its per-outlet lock is held for the shortest time. Format: `GUL-000447`.
7. **Store the sale and its lines** with price and name snapshots, the till time (`occurredAt`) and the trading day in the outlet's time zone.
8. **Write the outbox events** (`sales.sale.completed`, one `inventory.stock.changed` per line).
9. **Commit.** Any failure before this point rolls back everything, including the receipt increment, so numbering stays gap-free.

After commit the relay delivers the events: Reporting updates its daily projections, Kitchen creates a ticket, and browsers receive the sale over SSE.

---

## Scaling strategy

The target in the brief (10 outlets, 100,000 transactions per month) averages about 3,300 sales per day and peaks around a few sales per second, which the current design handles on a single small PostgreSQL instance. The plan for growing beyond that, in order of when it would be needed:

1. Connection pooling (PgBouncer) and horizontal API instances; the API is stateless and realtime already fans out across instances.
2. Retention for `outbox_events` and `inbox`, and monthly range partitioning of `sales`, `sale_lines` and `stock_movements`.
3. Reporting on a read replica, then a warehouse for ad-hoc analytics; reports already read pre-aggregated projections.
4. Observability: request-id correlated logs, metrics, tracing, and alerts on outbox lag and dead letters.
5. Extracting services along the module seams, read side first.

The full plan with numbers, the microservices path and the offline POS strategy: [docs/architecture.md](docs/architecture.md).

---

## Testing

```bash
pnpm db:up
pnpm test
```

Integration tests run against a real PostgreSQL database (`tablewise_test`), rebuilt from the real migrations at the start of every run, and drive the app through HTTP with Supertest. What they prove:

| Test file                               | Guarantees                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/sales-concurrency.test.ts`        | 40 parallel sales for 25 items: exactly 25 succeed, 15 fail with `INSUFFICIENT_STOCK`, receipts are exactly 1..25, stock ends at 0 with 25 audit rows. Outlets number independently in parallel. Multi-item sales locking rows in opposite order do not deadlock. 8 parallel retries with one `Idempotency-Key` create one sale and deduct stock once. A failed sale rolls back fully, including its receipt number. Lines use the outlet's effective price and repeated items merge. Items not on the outlet menu are refused. |
| `test/catalog-inventory.test.ts`        | Duplicate SKU is refused. An outlet sees only its assigned, available, active items; overrides are per outlet and can be cleared. First assignment opens stock with an audited `INITIAL` movement. Adjustments never go below zero; the database `CHECK` refuses negative stock even for raw SQL. Stock for unassigned items is refused.                                                                                                                                                                                        |
| `test/access-and-validation.test.ts`    | Cookie and Bearer sessions; one generic message for wrong password and unknown email. 401 without a session. Outlet staff cannot read or sell for another outlet; HQ-only routes refuse staff; HQ cannot sell. Another outlet's sale is a 404. Every validation issue is returned with its path. Malformed `Idempotency-Key` and JSON are rejected. The OpenAPI document is generated from the routes.                                                                                                                          |
| `test/events-reporting-kitchen.test.ts` | The sale event is written in the sale's transaction and not at all when the sale fails. Revenue per outlet, totals, zero rows for outlets without sales, top-N ranking, staff scoping. A redelivered event is projected once. A sale becomes a kitchen ticket and the board's state machine refuses skipped steps.                                                                                                                                                                                                              |
| `src/**/*.test.ts`                      | Password hashing; trading-day helpers use the business time zone, not the server's.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## Frontend

`apps/web` is a React 19 single-page app with two experiences, chosen by the signed-in role:

| Area       | Pages                                                                                                                                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HQ console | Dashboard (revenue, orders, average ticket with change vs the previous period, revenue trend, revenue by outlet, top 5 items per outlet, live sales feed, low-stock alerts), master menu, outlets, outlet detail (assignments, price overrides, stock), sales history with receipts |
| Outlet app | POS (category tabs, search, stock-aware item grid, cart, payment method, receipt), kitchen display, inventory with restock and audit trail, the outlet's sales history                                                                                                              |
| Shared     | Command palette (Ctrl/Cmd + K), light and dark themes, live updates, responsive layouts from 375 px phones to wide desktops                                                                                                                                                         |

### How it is organised

```text
apps/web/src/
  app/          router (every page lazy-loaded), route guards, navigation, error pages
  api/          query-key tree per backend module + typed query and mutation definitions
  components/   ui/ (design system primitives), layout/ (app shell), charts/
  features/     one folder per area: auth, dashboard, menu, outlets, pos, kitchen, inventory, sales, command, realtime
  hooks/ lib/   framework-free helpers (money and time formatting, fuzzy search, shared clock)
  styles/       design tokens (OKLCH colours, motion, control sizes) for light and dark
```

Features import from `api/`, `components/` and `lib/`, never from each other's internals. The `api/` layer mirrors the backend modules, so if a module becomes its own service only its base URL changes.

### Decisions and why

| Decision                                                    | Why                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server state in TanStack Query, almost no client state      | The database is the source of truth. Query keys are grouped per backend module, so a change invalidates exactly the screens that show it.                                                                                                                              |
| Live updates patch the cache instead of refetching          | The SSE stream carries the changed values (a stock level, a ticket status). The client writes them straight into the cached queries and only debounces a refetch for derived data such as report totals. Ten outlets selling at once do not cause a storm of requests. |
| URL-driven dialogs, tabs and filters (`?item=`, `?tab=`)    | Reload, the back button and deep links work; the command palette can open a menu item directly.                                                                                                                                                                        |
| Optimistic updates where the server rarely says no          | Assigning items, price overrides and moving kitchen tickets feel instant; on an error the cache rolls back and a toast explains why.                                                                                                                                   |
| The POS sends an `Idempotency-Key` per cart                 | A double tap or a retry on a flaky connection can never charge twice. The key changes whenever the cart changes, so a different order is never mistaken for a retry.                                                                                                   |
| Accessible primitives (Base UI) styled with Tailwind tokens | Focus management, keyboard support and ARIA come from a maintained library; the look comes from one token file, so light and dark themes stay consistent.                                                                                                              |
| A hand-written SVG chart instead of a chart library         | The dashboard needs one area chart. A small SVG component avoids a 100 kB+ dependency and uses the design tokens directly.                                                                                                                                             |
| Route-level code splitting and vendor chunks                | The first load downloads only the shell and the current page. React, data and UI libraries sit in separate long-cached chunks, so a deploy usually invalidates only the app code.                                                                                      |
| Motion with purpose                                         | Animations explain a change (a new sale slides in, a cart line expands, a ticket moves column) and stay short. They are disabled when the user prefers reduced motion.                                                                                                 |

In production the API serves the built app from the same origin, so the session cookie is first-party and no CORS setup is needed. In development Vite proxies `/api` to the API for the same reason.

---

## Deployment

The repository deploys as **one Docker image** that runs the API and serves the web app.

**Hosted demo: Render + Neon.** The container runs on Render; the database is [Neon](https://neon.tech) serverless PostgreSQL, which (unlike Render's free PostgreSQL) does not expire after 30 days.

1. Create a Neon project and copy its **direct** connection string (host without `-pooler`). The app keeps a `LISTEN` connection open for live updates, which a transaction-mode pooler would break.
2. Render dashboard -> **New** -> **Blueprint** -> select this repository. [`render.yaml`](render.yaml) defines the Docker web service; Render asks for `DATABASE_URL`, generates `JWT_SECRET`, builds the image and starts it. The health check is `/health/ready`.
3. On first boot the app applies migrations and, because `SEED_DEMO_DATA=true`, fills the empty database with demo data.

Render's free plan sleeps after 15 minutes without traffic; the next request waits while the container starts. Neon suspends its compute when idle and wakes on the next connection, and the realtime listener reconnects by itself.

**Any container host.** Build with `docker build -t tablewise .` and provide `DATABASE_URL` and `JWT_SECRET` (plus `TRUST_PROXY=true` behind a TLS-terminating proxy). The image runs as a non-root user, has a container health check, and applies pending migrations on start under an advisory lock, so several instances can start at once.

**Continuous integration.** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs typecheck, lint, format check, the full test suite against a PostgreSQL service container and the production build on every push and pull request, and checks that the Docker image builds. Dependabot proposes weekly updates for dependencies, Actions and the base image.

---

## Project structure

```text
tablewise-hq/
  apps/
    api/
      migrations/           plain-SQL migrations, one per module schema
      scripts/build.mjs     esbuild bundle for production
      src/
        config/env.ts       the only place that reads process.env (zod-validated)
        platform/           business-agnostic infrastructure
          auth/             actor, scrypt passwords, JWT token service
          db/               Database (ambient transactions), migrator, SQL helpers
          events/           outbox, outbox relay, event bus (with inbox)
          http/             declarative routes, middleware, errors, OpenAPI
          realtime/         SSE gateway with LISTEN/NOTIFY fan-out
        modules/
          identity/ outlets/ catalog/ inventory/ sales/ kitchen/ reporting/
            <name>.routes.ts      route declarations
            <name>.controller.ts  HTTP <-> service
            <name>.service.ts     business rules and ports
            <name>.repository.ts  SQL
            index.ts              the module's public API and factory
        container.ts        composition root: wires modules through their ports
        app.ts              Express app (middleware, routes, docs, static web)
        main.ts             process entry: migrate, start relay and realtime, listen, graceful shutdown
        cli/                migrate, seed, reset commands
        seed/demo-data.ts   reproducible demo data through the real module APIs
      test/                 integration tests against PostgreSQL
    web/                    React 19 + Vite single-page app (see Frontend)
  packages/
    contracts/              zod schemas, DTO types, error codes, event types shared by API and web
  docs/
    architecture.md         diagrams, ERD, scaling, microservices, offline POS
    adr/                    architecture decision records
  docker/postgres/init/     creates the test database on first start
  .github/                  CI workflow and Dependabot
  docker-compose.yml
  Dockerfile                multi-stage production image (API + web)
  render.yaml               Render Blueprint (Docker web service; database on Neon)
```
