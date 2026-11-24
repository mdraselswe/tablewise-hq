-- Kitchen module: tickets for the Kitchen Display System (KDS), created from sale events.

CREATE SCHEMA IF NOT EXISTS kitchen;

CREATE TABLE kitchen.tickets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    uuid        NOT NULL,
  outlet_id  uuid        NOT NULL,
  receipt_no varchar(24) NOT NULL,
  status     varchar(12) NOT NULL DEFAULT 'NEW',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ready_at   timestamptz,
  served_at  timestamptz,
  -- One ticket per sale; a redelivered event cannot create a duplicate.
  CONSTRAINT tickets_sale_key UNIQUE (sale_id),
  CONSTRAINT tickets_sale_fkey FOREIGN KEY (sale_id) REFERENCES sales.sales (id) ON DELETE CASCADE,
  CONSTRAINT tickets_outlet_fkey FOREIGN KEY (outlet_id) REFERENCES outlets.outlets (id) ON DELETE CASCADE,
  CONSTRAINT tickets_status_chk CHECK (status IN ('NEW', 'PREPARING', 'READY', 'SERVED'))
);

-- The board only shows open tickets; the partial index ignores the served backlog.
CREATE INDEX tickets_outlet_open_idx ON kitchen.tickets (outlet_id, created_at) WHERE status <> 'SERVED';
CREATE INDEX tickets_outlet_created_idx ON kitchen.tickets (outlet_id, created_at DESC);

CREATE TRIGGER tickets_set_updated_at
  BEFORE UPDATE ON kitchen.tickets
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

CREATE TABLE kitchen.ticket_items (
  ticket_id uuid         NOT NULL,
  line_no   smallint     NOT NULL,
  item_name varchar(120) NOT NULL,
  quantity  integer      NOT NULL,
  CONSTRAINT ticket_items_pkey PRIMARY KEY (ticket_id, line_no),
  CONSTRAINT ticket_items_ticket_fkey FOREIGN KEY (ticket_id) REFERENCES kitchen.tickets (id) ON DELETE CASCADE,
  CONSTRAINT ticket_items_quantity_chk CHECK (quantity > 0)
);
