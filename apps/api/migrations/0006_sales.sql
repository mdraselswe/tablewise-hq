-- Sales module: completed sales, their lines, and per-outlet receipt numbering.

CREATE SCHEMA IF NOT EXISTS sales;

-- One counter row per outlet. Incrementing it takes a row lock that is held until
-- the sale commits, so receipt numbers are strictly sequential and gap-free per
-- outlet, even under concurrent requests. A rolled-back sale also rolls back its
-- increment. (A native SEQUENCE is faster but leaves gaps on rollback.)
CREATE TABLE sales.receipt_sequences (
  outlet_id  uuid        PRIMARY KEY,
  last_value bigint      NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipt_sequences_outlet_fkey
    FOREIGN KEY (outlet_id) REFERENCES outlets.outlets (id) ON DELETE CASCADE,
  CONSTRAINT receipt_sequences_last_value_chk CHECK (last_value >= 0)
);

CREATE TABLE sales.sales (
  id              uuid         PRIMARY KEY,
  outlet_id       uuid         NOT NULL,
  receipt_seq     bigint       NOT NULL,
  receipt_no      varchar(24)  NOT NULL,
  payment_method  varchar(20)  NOT NULL,
  total_minor     bigint       NOT NULL,
  item_count      integer      NOT NULL,
  idempotency_key uuid,
  cashier_id      uuid,
  cashier_name    varchar(120),
  -- When the sale happened at the till (an offline terminal may sync it later) ...
  occurred_at     timestamptz  NOT NULL,
  -- ... the trading day it belongs to, in the outlet's own time zone ...
  business_date   date         NOT NULL,
  -- ... and when HQ recorded it.
  created_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT sales_outlet_fkey FOREIGN KEY (outlet_id) REFERENCES outlets.outlets (id) ON DELETE RESTRICT,
  CONSTRAINT sales_cashier_fkey FOREIGN KEY (cashier_id) REFERENCES identity.users (id) ON DELETE SET NULL,
  -- Two sales of one outlet can never share a receipt number.
  CONSTRAINT sales_outlet_receipt_seq_key UNIQUE (outlet_id, receipt_seq),
  CONSTRAINT sales_receipt_no_key UNIQUE (receipt_no),
  -- A retried request (same Idempotency-Key) can never create a second sale.
  CONSTRAINT sales_outlet_idempotency_key UNIQUE (outlet_id, idempotency_key),
  CONSTRAINT sales_receipt_seq_chk CHECK (receipt_seq > 0),
  CONSTRAINT sales_total_chk CHECK (total_minor >= 0),
  CONSTRAINT sales_item_count_chk CHECK (item_count > 0),
  CONSTRAINT sales_payment_method_chk CHECK (payment_method IN ('CASH', 'CARD', 'MOBILE_WALLET'))
);

-- Outlet sales history, newest first, filtered by trading day.
CREATE INDEX sales_outlet_business_date_idx ON sales.sales (outlet_id, business_date DESC, receipt_seq DESC);
-- HQ-wide history across outlets.
CREATE INDEX sales_business_date_idx ON sales.sales (business_date DESC, occurred_at DESC);

CREATE TABLE sales.sale_lines (
  sale_id          uuid         NOT NULL,
  line_no          smallint     NOT NULL,
  menu_item_id     uuid         NOT NULL,
  -- Name, SKU and price are snapshots: later menu edits never rewrite history.
  sku              varchar(40)  NOT NULL,
  item_name        varchar(120) NOT NULL,
  unit_price_minor integer      NOT NULL,
  quantity         integer      NOT NULL,
  line_total_minor bigint       NOT NULL,
  CONSTRAINT sale_lines_pkey PRIMARY KEY (sale_id, line_no),
  CONSTRAINT sale_lines_sale_fkey FOREIGN KEY (sale_id) REFERENCES sales.sales (id) ON DELETE CASCADE,
  CONSTRAINT sale_lines_menu_item_fkey
    FOREIGN KEY (menu_item_id) REFERENCES catalog.menu_items (id) ON DELETE RESTRICT,
  CONSTRAINT sale_lines_sale_item_key UNIQUE (sale_id, menu_item_id),
  CONSTRAINT sale_lines_quantity_chk CHECK (quantity > 0),
  CONSTRAINT sale_lines_unit_price_chk CHECK (unit_price_minor >= 0),
  CONSTRAINT sale_lines_total_chk CHECK (line_total_minor = unit_price_minor::bigint * quantity)
);

-- Item-level analysis ("every sale of item Y").
CREATE INDEX sale_lines_menu_item_idx ON sales.sale_lines (menu_item_id);
