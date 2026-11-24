import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api, createFixture, createTestContext, type Fixture, truncateAll } from "./helpers.ts";

describe("outbox events, reporting projections and the kitchen board", () => {
  const context = createTestContext();
  const { app, container } = context;
  let fixture: Fixture;
  let tokenA: string;
  let hqToken: string;

  beforeEach(async () => {
    await truncateAll(container.db);
    fixture = await createFixture(container);
    tokenA = await fixture.token(fixture.staffA);
    hqToken = await fixture.token(fixture.hq);
  });

  afterAll(() => context.close());

  const sell = (lines: { menuItemId: string; quantity: number }[]) =>
    api(app, tokenA).post(`/outlets/${fixture.outletA.id}/sales`, { lines, paymentMethod: "CASH" });

  it("writes the sale event in the same transaction, and not at all when the sale fails", async () => {
    await sell([{ menuItemId: fixture.items.latte, quantity: 1 }]);
    await sell([{ menuItemId: fixture.items.latte, quantity: 1_000 }]);
    const events = await container.db.many<{ event_type: string }>(
      "SELECT event_type FROM platform.outbox_events WHERE event_type = 'sales.sale.completed'",
    );
    expect(events).toHaveLength(1);
  });

  it("reports revenue per outlet and the top 5 items per outlet", async () => {
    const { latte, burger, fries } = fixture.items;
    await sell([
      { menuItemId: latte, quantity: 3 },
      { menuItemId: fries, quantity: 1 },
    ]); // 96_000 + 18_000
    await sell([{ menuItemId: burger, quantity: 2 }]); // 90_000
    await sell([{ menuItemId: fries, quantity: 4 }]); // 72_000
    await container.relay.drain();

    const revenue = await api(app, hqToken).get("/reports/revenue");
    expect(revenue.status).toBe(200);
    const outletA = revenue.body.outlets.find(
      (outlet: { outletCode: string }) => outlet.outletCode === "AAA",
    );
    expect(outletA).toMatchObject({
      revenueMinor: 276_000,
      saleCount: 3,
      itemsSold: 10,
      averageTicketMinor: 92_000,
    });
    // An outlet without sales still appears, with zeros.
    expect(
      revenue.body.outlets.find((outlet: { outletCode: string }) => outlet.outletCode === "BBB"),
    ).toMatchObject({
      revenueMinor: 0,
      saleCount: 0,
    });
    expect(revenue.body.totals.revenueMinor).toBe(276_000);

    const top = await api(app, hqToken).get("/reports/top-items?limit=2");
    const ranked = top.body.outlets.find(
      (outlet: { outletCode: string }) => outlet.outletCode === "AAA",
    ).items;
    expect(
      ranked.map((item: { rank: number; sku: string; quantity: number }) => [
        item.rank,
        item.sku,
        item.quantity,
      ]),
    ).toEqual([
      [1, "FRIES", 5],
      [2, "LATTE", 3],
    ]);

    // Outlet staff are scoped to their own outlet automatically.
    const scoped = await api(app, tokenA).get("/reports/revenue");
    expect(scoped.body.outlets).toHaveLength(1);
  });

  it("breaks full ties in the top-N ranking by item id, so the order never changes between calls", async () => {
    const twin = async (sku: string) => {
      const item = await container.api.catalog.createMenuItem({
        sku,
        name: "Twin Muffin",
        category: "Bakery",
        basePriceMinor: 10_000,
      });
      await container.api.catalog.assign(fixture.outletA.id, item.id, { openingStock: 10 }, fixture.hq);
      return item.id;
    };
    const ids = [await twin("TWIN-1"), await twin("TWIN-2")];
    await sell(ids.map((menuItemId) => ({ menuItemId, quantity: 1 })));
    await container.relay.drain();

    const top = await api(app, hqToken).get(`/reports/top-items?outletId=${fixture.outletA.id}`);
    const twins = top.body.outlets[0].items.filter((item: { sku: string }) => item.sku.startsWith("TWIN"));
    expect(twins.map((item: { menuItemId: string }) => item.menuItemId)).toEqual([...ids].sort());
  });

  it("projects each event once even if it is delivered again", async () => {
    await sell([{ menuItemId: fixture.items.latte, quantity: 1 }]);
    await container.relay.drain();
    // Simulate a redelivery: mark the events unpublished and relay again.
    await container.db.query("UPDATE platform.outbox_events SET published_at = NULL");
    await container.relay.drain();
    const row = await container.db.one<{ sale_count: number }>(
      "SELECT sale_count FROM reporting.daily_outlet_sales WHERE outlet_id = $1",
      [fixture.outletA.id],
    );
    expect(row?.sale_count).toBe(1);
  });

  it("turns a sale into a kitchen ticket and enforces the board's state machine", async () => {
    const sale = await sell([{ menuItemId: fixture.items.burger, quantity: 2 }]);
    await container.relay.drain();

    const board = await api(app, tokenA).get(`/outlets/${fixture.outletA.id}/kitchen/tickets`);
    expect(board.body).toHaveLength(1);
    const ticket = board.body[0];
    expect(ticket).toMatchObject({
      saleId: sale.body.id,
      status: "NEW",
      items: [{ itemName: "Beef Burger", quantity: 2 }],
    });

    const skip = await api(app, tokenA).patch(`/kitchen/tickets/${ticket.id}`, { status: "SERVED" });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe("INVALID_STATE_TRANSITION");

    for (const status of ["PREPARING", "READY", "SERVED"]) {
      const step = await api(app, tokenA).patch(`/kitchen/tickets/${ticket.id}`, { status });
      expect(step.status).toBe(200);
      expect(step.body.status).toBe(status);
    }
    const after = await api(app, tokenA).get(`/outlets/${fixture.outletA.id}/kitchen/tickets`);
    expect(after.body).toHaveLength(0);
  });
});
