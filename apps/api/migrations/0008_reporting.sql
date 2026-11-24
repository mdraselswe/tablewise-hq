-- Reporting module: read models (CQRS projections) built from integration events.
--
-- These tables deliberately have NO foreign keys to other modules and are never
-- joined with them. Reporting only knows what events told it, so it can move to
-- its own database, a read replica or a warehouse without changing a query.
-- Pre-aggregating per day keeps every report O(outlets x days), not O(sales).

CREATE SCHEMA IF NOT EXISTS reporting;

-- Local copy of outlet names, fed by outlets.outlet.upserted.
CREATE TABLE reporting.outlet_directory (
  outlet_id  uuid         PRIMARY KEY,
  code       varchar(8)   NOT NULL,
  name       varchar(120) NOT NULL,
  is_active  boolean      NOT NULL,
  updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE reporting.daily_outlet_sales (
  outlet_id     uuid        NOT NULL,
  business_date date        NOT NULL,
  sale_count    integer     NOT NULL DEFAULT 0,
  items_sold    integer     NOT NULL DEFAULT 0,
  revenue_minor bigint      NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_outlet_sales_pkey PRIMARY KEY (outlet_id, business_date),
  CONSTRAINT daily_outlet_sales_counts_chk CHECK (sale_count >= 0 AND items_sold >= 0 AND revenue_minor >= 0)
);

-- Cross-outlet range scans ("all outlets, last 30 days").
CREATE INDEX daily_outlet_sales_date_idx ON reporting.daily_outlet_sales (business_date);

CREATE TABLE reporting.daily_item_sales (
  outlet_id     uuid         NOT NULL,
  business_date date         NOT NULL,
  menu_item_id  uuid         NOT NULL,
  sku           varchar(40)  NOT NULL,
  item_name     varchar(120) NOT NULL,
  quantity      integer      NOT NULL DEFAULT 0,
  revenue_minor bigint       NOT NULL DEFAULT 0,
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT daily_item_sales_pkey PRIMARY KEY (outlet_id, business_date, menu_item_id),
  CONSTRAINT daily_item_sales_counts_chk CHECK (quantity >= 0 AND revenue_minor >= 0)
);

CREATE INDEX daily_item_sales_date_outlet_idx ON reporting.daily_item_sales (business_date, outlet_id);
