# ADR 0003: Sale concurrency, stock locking and gap-free receipt numbers

- Status: accepted
- Date: 2026-11-24

## Context

The brief requires that a sale deducts outlet stock without ever going negative, that each outlet gets sequential receipt numbers that stay correct under concurrent requests, and that the whole sale is one database transaction. Tills retry on flaky networks, so a retry must not create a second sale.

## Decision

Inside one `READ COMMITTED` transaction:

1. Merge repeated items and sort lines by `menu_item_id`.
2. If an `Idempotency-Key` is present, take `pg_advisory_xact_lock` on `(outlet, key)` and return the existing sale if one is found. The sale stores a SHA-256 fingerprint of its normalised request; a different request under the same key fails with `IDEMPOTENCY_KEY_REUSED` rather than replaying the wrong sale. This runs before the `occurredAt` window check so late retries of accepted offline sales still replay.
3. Price lines from the catalog (assigned, available, active items only).
4. Lock the outlet's stock rows with `SELECT ... FOR UPDATE ORDER BY menu_item_id`, check every line, report all shortfalls at once, then deduct in one statement and write audit rows.
5. Take the next receipt number last: `INSERT INTO sales.receipt_sequences ... ON CONFLICT (outlet_id) DO UPDATE SET last_value = last_value + 1 RETURNING last_value`.
6. Insert the sale, its lines and its outbox events, then commit.

Database constraints back every rule: `CHECK (on_hand >= 0)`, `UNIQUE (outlet_id, receipt_seq)`, `UNIQUE (receipt_no)`, `UNIQUE (outlet_id, idempotency_key)`, `CHECK (line_total_minor = unit_price_minor * quantity)`.

## Alternatives considered

- **PostgreSQL `SEQUENCE` per outlet.** Fast, but sequences are not transactional: a rolled-back sale burns a number and leaves a gap. It also needs DDL for every new outlet.
- **`MAX(receipt_seq) + 1`.** Races under concurrency without a lock, and needs a table-level lock to be correct.
- **`SERIALIZABLE` isolation.** Correct, but under contention it aborts transactions that must then be retried by the application. Explicit row locks give exactly the serialisation needed.
- **Optimistic stock updates (`UPDATE ... WHERE on_hand >= n`) per line.** Works for single items, but multi-item sales would need per-line retries and still need ordered locking to avoid deadlocks. Locking first also allows reporting every shortfall in one response.

## Consequences

- No oversell, no duplicate and no gap in receipt numbers, proven by tests firing 40 parallel sales for 25 units and parallel retries with one key.
- No deadlocks between multi-item sales, because all transactions lock rows in the same order.
- Sales in the same outlet serialise on the counter row for about a millisecond at the end of the transaction; different outlets never wait for each other.
- Offline terminals cannot obtain official numbers; they use provisional numbers and receive the official one on sync (see the offline strategy in [architecture.md](../architecture.md#offline-pos-and-kds-strategy)).
