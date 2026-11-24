import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api, createFixture, createTestContext, type Fixture, stockOf, truncateAll } from "./helpers.ts";

describe("master menu, outlet assignment and inventory", () => {
  const context = createTestContext();
  const { app, container } = context;
  let fixture: Fixture;
  let hqToken: string;
  let tokenA: string;

  beforeEach(async () => {
    await truncateAll(container.db);
    fixture = await createFixture(container);
    hqToken = await fixture.token(fixture.hq);
    tokenA = await fixture.token(fixture.staffA);
  });

  afterAll(() => context.close());

  it("lets HQ create a master item and rejects a duplicate SKU", async () => {
    const body = { sku: "mocha", name: "Mocha", category: "Coffee", basePriceMinor: 31_000 };
    const created = await api(app, hqToken).post("/menu-items", body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ sku: "MOCHA", isActive: true, assignedOutletCount: 0 });

    const duplicate = await api(app, hqToken).post("/menu-items", body);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toMatch(/SKU already exists/);
  });

  it("shows an outlet only its assigned, available, active items at the effective price", async () => {
    const menuA = await api(app, tokenA).get(`/outlets/${fixture.outletA.id}/menu`);
    expect(menuA.status).toBe(200);
    expect(menuA.body.map((item: { sku: string }) => item.sku).sort()).toEqual(["BURGER", "FRIES", "LATTE"]);
    expect(menuA.body.find((item: { sku: string }) => item.sku === "LATTE")).toMatchObject({
      priceMinor: 32_000,
      basePriceMinor: 29_000,
      hasPriceOverride: true,
    });

    // Outlet B sells the same latte at the base price: overrides are per outlet.
    const tokenB = await fixture.token(fixture.staffB);
    const menuB = await api(app, tokenB).get(`/outlets/${fixture.outletB.id}/menu`);
    expect(menuB.body.find((item: { sku: string }) => item.sku === "LATTE")).toMatchObject({
      priceMinor: 29_000,
    });

    // Unavailable at the outlet, or deactivated at HQ: gone from the menu.
    await api(app, hqToken).put(`/outlets/${fixture.outletA.id}/assignments/${fixture.items.fries}`, {
      isAvailable: false,
    });
    await api(app, hqToken).patch(`/menu-items/${fixture.items.burger}`, { isActive: false });
    const after = await api(app, tokenA).get(`/outlets/${fixture.outletA.id}/menu`);
    expect(after.body.map((item: { sku: string }) => item.sku)).toEqual(["LATTE"]);
  });

  it("updates and clears an outlet price override", async () => {
    const path = `/outlets/${fixture.outletA.id}/assignments/${fixture.items.latte}`;
    const changed = await api(app, hqToken).put(path, { priceOverrideMinor: 35_000 });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ priceOverrideMinor: 35_000, effectivePriceMinor: 35_000 });

    const cleared = await api(app, hqToken).put(path, { priceOverrideMinor: null });
    expect(cleared.body).toMatchObject({ priceOverrideMinor: null, effectivePriceMinor: 29_000 });
  });

  it("opens stock with an audited INITIAL movement when an item is first assigned", async () => {
    const response = await api(app, hqToken).put(
      `/outlets/${fixture.outletB.id}/assignments/${fixture.items.fries}`,
      {
        openingStock: 40,
      },
    );
    expect(response.status).toBe(201);
    expect(await stockOf(container.db, fixture.outletB.id, fixture.items.fries)).toBe(40);

    const hqMovements = await api(app, hqToken).get(
      `/outlets/${fixture.outletB.id}/inventory/movements?menuItemId=${fixture.items.fries}`,
    );
    expect(hqMovements.body.items).toEqual([
      expect.objectContaining({ reason: "INITIAL", delta: 40, balanceAfter: 40, actorName: "HQ Admin" }),
    ]);
  });

  it("refuses a stock change that would go below zero and records valid ones", async () => {
    const path = `/outlets/${fixture.outletA.id}/inventory/${fixture.items.fries}/adjustments`;
    const tooMuch = await api(app, tokenA).post(path, { delta: -101, reason: "ADJUSTMENT" });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(container.db, fixture.outletA.id, fixture.items.fries)).toBe(100);

    const restock = await api(app, tokenA).post(path, {
      delta: 20,
      reason: "RESTOCK",
      note: "Morning delivery",
    });
    expect(restock.status).toBe(200);
    expect(restock.body.onHand).toBe(120);

    const wrongSign = await api(app, tokenA).post(path, { delta: 5, reason: "WASTE" });
    expect(wrongSign.status).toBe(400);
    expect(wrongSign.body.error.details.issues[0].path).toBe("body.delta");
  });

  it("enforces non-negative stock in the database itself, not only in code", async () => {
    await expect(
      container.db.query("UPDATE inventory.stock_levels SET on_hand = -1 WHERE outlet_id = $1", [
        fixture.outletA.id,
      ]),
    ).rejects.toThrow(/stock_levels_on_hand_non_negative_chk/);
  });

  it("refuses stock for an item that is not assigned to the outlet", async () => {
    const response = await api(app, tokenA).post(
      `/outlets/${fixture.outletA.id}/inventory/${fixture.items.cake}/adjustments`,
      { delta: 5, reason: "RESTOCK" },
    );
    expect(response.status).toBe(404);
  });
});
