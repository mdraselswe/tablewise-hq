-- Indexes for keyset pagination of the two tables that grow without limit.
--
-- Sales history is read newest first by (business_date, occurred_at, id); id makes
-- the key unique so a cursor never skips or repeats a row. With the whole key in
-- the index, "the next 25 after this sale" is a short index range scan, at any depth.
-- These replace the older indexes, whose last column (receipt_seq) did not match
-- the sort, so PostgreSQL had to sort each trading day's rows.
--
-- At this size a plain CREATE INDEX inside the migration transaction is fine. On a
-- large live table, build with CREATE INDEX CONCURRENTLY outside a transaction first.

DROP INDEX sales.sales_outlet_business_date_idx;
DROP INDEX sales.sales_business_date_idx;

-- Outlet sales history (staff, and HQ filtered by outlet).
CREATE INDEX sales_outlet_history_idx
  ON sales.sales (outlet_id, business_date DESC, occurred_at DESC, id DESC);
-- HQ-wide sales history across outlets.
CREATE INDEX sales_history_idx
  ON sales.sales (business_date DESC, occurred_at DESC, id DESC);

-- Per-item stock history: add id so the keyset (created_at, id) is fully indexed.
DROP INDEX inventory.stock_movements_outlet_item_created_idx;
CREATE INDEX stock_movements_outlet_item_created_idx
  ON inventory.stock_movements (outlet_id, menu_item_id, created_at DESC, id DESC);
