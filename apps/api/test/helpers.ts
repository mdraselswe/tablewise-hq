import type { Express } from "express";
import request from "supertest";
import type { SessionUser } from "@tablewise/contracts";
import { createApp } from "@/app.ts";
import { loadEnv } from "@/config/env.ts";
import { type Container, createContainer } from "@/container.ts";
import type { Database } from "@/platform/db/database.ts";
import { createLogger } from "@/platform/logger.ts";

export const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ?? "postgres://tablewise:tablewise@localhost:5433/tablewise_test";

export interface TestContext {
  container: Container;
  app: Express;
  close: () => Promise<void>;
}

export function createTestContext(): TestContext {
  const env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    DATABASE_POOL_MAX: "20",
    JWT_SECRET: "test-secret-that-is-long-enough-0123456789",
    MIGRATE_ON_BOOT: "false",
  });
  const container = createContainer(env, createLogger(env));
  return { container, app: createApp(container), close: () => container.close() };
}

/** Empties every module table between tests (schema stays). */
export async function truncateAll(db: Database): Promise<void> {
  await db.query(`
    TRUNCATE
      reporting.daily_item_sales, reporting.daily_outlet_sales, reporting.outlet_directory,
      kitchen.ticket_items, kitchen.tickets,
      sales.sale_lines, sales.sales, sales.receipt_sequences,
      inventory.stock_movements, inventory.stock_levels,
      catalog.outlet_menu_items, catalog.menu_items,
      identity.users, outlets.outlets,
      platform.outbox_events, platform.inbox
    RESTART IDENTITY CASCADE`);
}

export interface Fixture {
  hq: SessionUser;
  outletA: { id: string; code: string };
  outletB: { id: string; code: string };
  staffA: SessionUser;
  staffB: SessionUser;
  items: { latte: string; burger: string; fries: string; cake: string };
  token: (user: SessionUser) => Promise<string>;
}

/**
 * Two outlets, one cashier each, four menu items.
 * Outlet A sells latte (override 320.00), burger, fries; outlet B sells latte (base) and cake.
 */
export async function createFixture(
  container: Container,
  stock: Partial<Record<string, number>> = {},
): Promise<Fixture> {
  const { api, tokens } = container;
  const hq = await api.identity.createUser({
    email: "hq@test.local",
    fullName: "HQ Admin",
    password: "password-123",
    role: "HQ_ADMIN",
    outletId: null,
  });
  const a = await api.outlets.create({ code: "AAA", name: "Outlet A", timezone: "Asia/Dhaka" });
  const b = await api.outlets.create({ code: "BBB", name: "Outlet B", timezone: "Asia/Dhaka" });
  const staffA = await api.identity.createUser({
    email: "a@test.local",
    fullName: "Cashier A",
    password: "password-123",
    role: "OUTLET_STAFF",
    outletId: a.id,
  });
  const staffB = await api.identity.createUser({
    email: "b@test.local",
    fullName: "Cashier B",
    password: "password-123",
    role: "OUTLET_STAFF",
    outletId: b.id,
  });

  const create = (sku: string, name: string, category: string, price: number) =>
    api.catalog.createMenuItem({ sku, name, category, basePriceMinor: price }).then((item) => item.id);
  const latte = await create("LATTE", "Cafe Latte", "Coffee", 29_000);
  const burger = await create("BURGER", "Beef Burger", "Burgers", 45_000);
  const fries = await create("FRIES", "French Fries", "Sides", 18_000);
  const cake = await create("CAKE", "Cheesecake", "Desserts", 34_000);

  await api.catalog.assign(
    a.id,
    latte,
    { priceOverrideMinor: 32_000, openingStock: stock["latte"] ?? 100 },
    hq,
  );
  await api.catalog.assign(a.id, burger, { openingStock: stock["burger"] ?? 100 }, hq);
  await api.catalog.assign(a.id, fries, { openingStock: stock["fries"] ?? 100 }, hq);
  await api.catalog.assign(b.id, latte, { openingStock: 100 }, hq);
  await api.catalog.assign(b.id, cake, { openingStock: 100 }, hq);

  return {
    hq,
    outletA: { id: a.id, code: a.code },
    outletB: { id: b.id, code: b.code },
    staffA,
    staffB,
    items: { latte, burger, fries, cake },
    token: async (user) => (await tokens.issue(user)).token,
  };
}

export function api(app: Express, token?: string) {
  const auth = (test: request.Test) => (token ? test.set("Authorization", `Bearer ${token}`) : test);
  return {
    get: (path: string) => auth(request(app).get(`/api/v1${path}`)),
    post: (path: string, body?: object) => auth(request(app).post(`/api/v1${path}`)).send(body),
    put: (path: string, body?: object) => auth(request(app).put(`/api/v1${path}`)).send(body),
    patch: (path: string, body?: object) => auth(request(app).patch(`/api/v1${path}`)).send(body),
    delete: (path: string) => auth(request(app).delete(`/api/v1${path}`)),
  };
}

export async function stockOf(
  db: Database,
  outletId: string,
  menuItemId: string,
): Promise<number | undefined> {
  const row = await db.one<{ on_hand: number }>(
    "SELECT on_hand FROM inventory.stock_levels WHERE outlet_id = $1 AND menu_item_id = $2",
    [outletId, menuItemId],
  );
  return row?.on_hand;
}
