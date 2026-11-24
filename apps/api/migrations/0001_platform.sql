-- Platform: cross-cutting infrastructure that belongs to no business module.
-- Each migration file runs inside its own transaction (see src/platform/db/migrator.ts).

CREATE SCHEMA IF NOT EXISTS platform;

-- Trigram index support for "contains" search on menu items.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION platform.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Transactional outbox. A module writes its integration events here in the SAME
-- transaction as its state change, so an event exists if and only if the change
-- committed. The relay publishes them afterwards (at-least-once).
CREATE TABLE platform.outbox_events (
  id             uuid        PRIMARY KEY,
  aggregate_type varchar(40) NOT NULL,
  aggregate_id   uuid        NOT NULL,
  event_type     varchar(80) NOT NULL,
  payload        jsonb       NOT NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  available_at   timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz,
  attempts       integer     NOT NULL DEFAULT 0,
  last_error     text,
  CONSTRAINT outbox_events_attempts_chk CHECK (attempts >= 0)
);

-- The relay only scans unpublished rows; a partial index keeps that scan tiny
-- no matter how much history the table holds.
CREATE INDEX outbox_events_pending_idx
  ON platform.outbox_events (available_at, occurred_at)
  WHERE published_at IS NULL;

CREATE INDEX outbox_events_aggregate_idx
  ON platform.outbox_events (aggregate_type, aggregate_id, occurred_at);

-- Inbox: makes every consumer idempotent. A consumer records (consumer, event_id)
-- in the same transaction as its own work, so a redelivered event is a no-op.
CREATE TABLE platform.inbox (
  consumer     varchar(60) NOT NULL,
  event_id     uuid        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_pkey PRIMARY KEY (consumer, event_id)
);
