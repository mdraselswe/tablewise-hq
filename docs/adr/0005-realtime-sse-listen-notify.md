# ADR 0005: Realtime with Server-Sent Events and PostgreSQL LISTEN/NOTIFY

- Status: accepted
- Date: 2026-11-24

## Context

The HQ dashboard, POS and kitchen display should update the moment a sale, stock change or ticket change commits, and this must work when several API instances run behind a load balancer.

## Decision

- Browsers subscribe with Server-Sent Events at `GET /api/v1/stream`.
- The realtime gateway is an ordinary event-bus consumer (`realtime.notify`). Delivering an event runs `pg_notify` inside the outbox relay's transaction, so a notification is only sent when delivery commits.
- Each instance keeps one dedicated connection that `LISTEN`s on the channel and writes events to its own SSE clients, filtered by the actor's outlet access.

## Alternatives considered

- **WebSockets.** Bidirectional, which this use case does not need; it needs extra handling for reconnects, proxies and authentication. SSE reconnects automatically and uses the existing cookie session.
- **Polling.** Simple, but either slow or wasteful, and it multiplies database load with every open screen.
- **Redis pub/sub or a message broker.** The standard choice at larger scale, but an extra service to run and pay for. PostgreSQL already provides pub/sub with the guarantees needed here.

## Consequences

- No extra infrastructure; works across instances out of the box.
- Notifications are fire-and-forget: a browser that is disconnected misses events. The web app refetches its queries on reconnect, so it converges.
- Payloads are limited to 8,000 bytes; oversized sale events are sent without their lines.
- If fan-out ever outgrows PostgreSQL, only the gateway changes (to Redis or a broker); producers and consumers stay the same.
