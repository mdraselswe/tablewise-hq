-- Catalog module: the HQ master menu and which outlet sells what, at what price.

CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TABLE catalog.menu_items (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  sku              varchar(40)  NOT NULL,
  name             varchar(120) NOT NULL,
  description      varchar(500),
  category         varchar(60)  NOT NULL,
  base_price_minor integer      NOT NULL,
  is_active        boolean      NOT NULL DEFAULT true,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT menu_items_sku_key UNIQUE (sku),
  CONSTRAINT menu_items_sku_format_chk CHECK (sku ~ '^[A-Z0-9-]{2,40}$'),
  CONSTRAINT menu_items_base_price_chk CHECK (base_price_minor >= 0)
);

-- Menu lists are grouped by category and sorted by name.
CREATE INDEX menu_items_category_name_idx ON catalog.menu_items (category, name);
-- "Contains" search over name and SKU (ILIKE '%latte%') without a sequential scan.
CREATE INDEX menu_items_search_trgm_idx
  ON catalog.menu_items USING gin ((name || ' ' || sku) gin_trgm_ops);

CREATE TRIGGER menu_items_set_updated_at
  BEFORE UPDATE ON catalog.menu_items
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- Assignment of a master item to an outlet, with an optional outlet-specific price.
CREATE TABLE catalog.outlet_menu_items (
  outlet_id            uuid        NOT NULL,
  menu_item_id         uuid        NOT NULL,
  price_override_minor integer,
  is_available         boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- The primary key doubles as the index for "the menu of outlet X".
  CONSTRAINT outlet_menu_items_pkey PRIMARY KEY (outlet_id, menu_item_id),
  CONSTRAINT outlet_menu_items_outlet_fkey
    FOREIGN KEY (outlet_id) REFERENCES outlets.outlets (id) ON DELETE CASCADE,
  CONSTRAINT outlet_menu_items_menu_item_fkey
    FOREIGN KEY (menu_item_id) REFERENCES catalog.menu_items (id) ON DELETE RESTRICT,
  CONSTRAINT outlet_menu_items_price_override_chk
    CHECK (price_override_minor IS NULL OR price_override_minor >= 0)
);

-- Serves "which outlets sell item Y".
CREATE INDEX outlet_menu_items_menu_item_idx ON catalog.outlet_menu_items (menu_item_id);

CREATE TRIGGER outlet_menu_items_set_updated_at
  BEFORE UPDATE ON catalog.outlet_menu_items
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
