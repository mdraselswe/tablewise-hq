# ADR 0001: Modular monolith with ports, schemas per module and a transactional outbox

- Status: accepted
- Date: 2026-11-24

## Context

The system must be easy to run today (10 outlets, 100,000 transactions per month) and must be convertible into microservices later without a rewrite. A sale touches three business areas (catalog for prices, inventory for stock, sales for the receipt) and must be atomic.

## Decision

Build one deployable Node.js process made of seven modules (`identity`, `outlets`, `catalog`, `inventory`, `sales`, `kitchen`, `reporting`) on a shared platform layer, with these rules:

1. Each module owns one PostgreSQL schema; only its repository queries it.
2. Modules never import each other. A service declares the ports it needs; `src/container.ts` wires each module's public `api` into those ports. ESLint enforces the boundary.
3. Work that can happen after commit is driven by integration events, written to `platform.outbox_events` in the same transaction as the change and delivered by a relay to idempotent consumers (`platform.inbox`).

## Alternatives considered

- **Microservices from day one.** Each sale would become a distributed saga with network failure handling, three deployments and three databases. That is a large cost with no benefit at the target load, and it makes "never oversell, never skip a receipt number" much harder to guarantee.
- **Classic layered monolith** (one `services/` folder, shared repositories). Simple at first, but nothing stops any service from querying any table, so the seams needed for a later split erode quietly.
- **Publishing events directly to a broker after commit.** Loses events when the process crashes between commit and publish, or publishes events for transactions that later roll back. The outbox avoids both.

## Consequences

- A sale is one local ACID transaction across modules, the simplest correct design.
- Extracting a module means replacing its `api` in the container with a remote client and moving the outbox relay onto a broker; callers keep the same port interfaces. See the extraction order in [architecture.md](../architecture.md#from-modular-monolith-to-microservices).
- Cross-schema foreign keys exist while modules share a database. They must be dropped when a module moves out, which is a deliberate, documented step.
- Kitchen and reporting are eventually consistent (milliseconds in practice).
