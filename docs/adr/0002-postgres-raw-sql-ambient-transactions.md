# ADR 0002: PostgreSQL with hand-written SQL and ambient transactions

- Status: accepted
- Date: 2026-11-24

## Context

The hard parts of this system are concurrency guarantees: row locks taken in a fixed order, upsert counters, advisory locks, `FOR UPDATE SKIP LOCKED`, batch inserts and window-function reports. A sale also spans repositories in three modules, which must all run on the same database connection inside one transaction.

## Decision

- Use the `pg` driver with parameterised, hand-written SQL inside repository classes. No ORM or query builder.
- Write migrations as plain SQL files applied by a small runner that records checksums and takes an advisory lock.
- Provide transactions through `Database.transaction()`, which stores the transaction's client in `AsyncLocalStorage`. Every query made while it runs, from any repository, joins it. Nested calls join the outer transaction; `savepoint()` and `afterCommit()` cover partial failure and post-commit work.

## Alternatives considered

- **ORM (Prisma, TypeORM, Drizzle).** Productive for CRUD, but the critical queries here would end up as raw SQL anyway, and ORMs make lock order, `ON CONFLICT` behaviour and transaction scope less visible in review. Prisma in particular cannot share an interactive transaction across arbitrary code without passing its client around.
- **Passing a transaction client through every function.** Explicit, but it leaks persistence concerns into every service and port signature, including ports that will later become remote calls.
- **Migration frameworks.** Useful, but plain SQL with checksums is enough here and keeps the DDL readable in review.

## Consequences

- Every important query is visible and reviewable in one place per module.
- Types are maintained by hand in the repositories; integration tests against a real database catch drift.
- `AsyncLocalStorage` is implicit: a query outside `transaction()` runs on the pool. `outbox.publish()` refuses to run outside a transaction to prevent the most dangerous mistake (an event without its change).
