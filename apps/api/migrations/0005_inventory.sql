-- Inventory module: stock per outlet per menu item, plus an append-only audit trail.

CREATE SCHEMA IF NOT EXISTS inventory;

CREATE TABLE inventory.stock_levels (
  outlet_id           uuid        NOT NULL,
  menu_item_id        uuid        NOT NULL,
  on_hand             integer     NOT NULL DEFAULT 0,
  low_stock_threshold integer     NOT NULL DEFAULT 10,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_levels_pkey PRIMARY KEY (outlet_id, menu_item_id),
  -- Stock exists only for items assigned to the outlet. Unassigning removes the
  -- level; its history stays in stock_movements.
  CONSTRAINT stock_levels_assignment_fkey
    FOREIGN KEY (outlet_id, menu_item_id)
    REFERENCES catalog.outlet_menu_items (outlet_id, menu_item_id) ON DELETE CASCADE,
  -- Last line of defence against overselling: the database itself refuses negative stock.
  CONSTRAINT stock_levels_on_hand_non_negative_chk CHECK (on_hand >= 0),
  CONSTRAINT stock_levels_threshold_chk CHECK (low_stock_threshold >= 0)
);

CREATE TRIGGER stock_levels_set_updated_at
  BEFORE UPDATE ON inventory.stock_levels
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- Every change to on_hand writes one row here, in the same transaction.
CREATE TABLE inventory.stock_movements (
  id             bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  outlet_id      uuid         NOT NULL,
  menu_item_id   uuid         NOT NULL,
  delta          integer      NOT NULL,
  balance_after  integer      NOT NULL,
  reason         varchar(20)  NOT NULL,
  reference_type varchar(20),
  reference_id   uuid,
  note           varchar(280),
  actor_id       uuid,
  actor_name     varchar(120),
  created_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_outlet_fkey
    FOREIGN KEY (outlet_id) REFERENCES outlets.outlets (id) ON DELETE CASCADE,
  CONSTRAINT stock_movements_menu_item_fkey
    FOREIGN KEY (menu_item_id) REFERENCES catalog.menu_items (id) ON DELETE RESTRICT,
  CONSTRAINT stock_movements_actor_fkey
    FOREIGN KEY (actor_id) REFERENCES identity.users (id) ON DELETE SET NULL,
  CONSTRAINT stock_movements_delta_chk CHECK (delta <> 0),
  CONSTRAINT stock_movements_balance_chk CHECK (balance_after >= 0),
  CONSTRAINT stock_movements_reason_chk
    CHECK (reason IN ('INITIAL', 'SALE', 'RESTOCK', 'ADJUSTMENT', 'WASTE'))
);

-- Outlet audit feed (newest first) and per-item history.
CREATE INDEX stock_movements_outlet_created_idx
  ON inventory.stock_movements (outlet_id, created_at DESC, id DESC);
CREATE INDEX stock_movements_outlet_item_created_idx
  ON inventory.stock_movements (outlet_id, menu_item_id, created_at DESC);
-- "Which movements did sale X cause".
CREATE INDEX stock_movements_reference_idx
  ON inventory.stock_movements (reference_type, reference_id) WHERE reference_id IS NOT NULL;
