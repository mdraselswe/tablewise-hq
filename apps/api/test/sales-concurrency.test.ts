import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api, createFixture, createTestContext, type Fixture, stockOf, truncateAll } from "./helpers.ts";

/**
 * The guarantees the brief asks for, proven against a real PostgreSQL under real
 * concurrency (parallel HTTP requests, each on its own pooled connection).
 */
describe("sales under concurrency", () => {
  const context = createTestContext();
  const { app, container } = context;
  let fixture: Fixture;
  let tokenA: string;

  beforeEach(async () => {
    await truncateAll(container.db);
    fixture = await createFixture(container, { burger: 25 });
    tokenA = await fixture.token(fixture.staffA);
  });

  afterAll(() => context.close());

  const sell = (
    lines: { menuItemId: string; quantity: number }[],
    options: { key?: string; token?: string; outletId?: string } = {},
  ) => {
    const request = api(app, options.token ?? tokenA).post(
      `/outlets/${options.outletId ?? fixture.outletA.id}/sales`,
      {
        lines,
        paymentMethod: "CASH",
      },
    );
    return options.key ? request.set("Idempotency-Key", options.key) : request;
  };

  it("never oversells and keeps receipt numbers gap-free with 40 parallel sales for 25 items", async () => {
    const responses = await Promise.all(
      Array.from({ length: 40 }, () => sell([{ menuItemId: fixture.items.burger, quantity: 1 }])),
    );

    const succeeded = responses.filter((response) => response.status === 201);
    const rejected = responses.filter((response) => response.status === 409);
    expect(succeeded).toHaveLength(25);
    expect(rejected).toHaveLength(15);
    for (const response of rejected) expect(response.body.error.code).toBe("INSUFFICIENT_STOCK");

    const sequences = succeeded.map((response) => response.body.receiptSeq as number).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(new Set(succeeded.map((response) => response.body.receiptNo)).size).toBe(25);
    expect(succeeded[0]?.body.receiptNo).toMatch(/^AAA-\d{6}$/);

    expect(await stockOf(container.db, fixture.outletA.id, fixture.items.burger)).toBe(0);
    const movements = await container.db.one<{ count: number; total: number }>(
      `SELECT count(*)::int AS count, sum(delta)::int AS total FROM inventory.stock_movements
        WHERE outlet_id = $1 AND menu_item_id = $2 AND reason = 'SALE'`,
      [fixture.outletA.id, fixture.items.burger],
    );
    expect(movements).toEqual({ count: 25, total: -25 });
  });

  it("numbers every outlet independently, in parallel", async () => {
    const tokenB = await fixture.token(fixture.staffB);
    const responses = await Promise.all([
      ...Array.from({ length: 10 }, () => sell([{ menuItemId: fixture.items.latte, quantity: 1 }])),
      ...Array.from({ length: 10 }, () =>
        sell([{ menuItemId: fixture.items.latte, quantity: 1 }], {
          token: tokenB,
          outletId: fixture.outletB.id,
        }),
      ),
    ]);
    expect(responses.every((response) => response.status === 201)).toBe(true);

    const byOutlet = (code: string) =>
      responses
        .filter((response) => String(response.body.receiptNo).startsWith(code))
        .map((response) => response.body.receiptSeq as number)
        .sort((a, b) => a - b);
    const expected = Array.from({ length: 10 }, (_, index) => index + 1);
    expect(byOutlet("AAA")).toEqual(expected);
    expect(byOutlet("BBB")).toEqual(expected);
  });

  it("does not deadlock when multi-item sales lock the same rows in opposite order", async () => {
    const { latte, fries } = fixture.items;
    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        sell(
          index % 2 === 0
            ? [
                { menuItemId: latte, quantity: 1 },
                { menuItemId: fries, quantity: 1 },
              ]
            : [
                { menuItemId: fries, quantity: 1 },
                { menuItemId: latte, quantity: 1 },
              ],
        ),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(30).fill(201));
    expect(await stockOf(container.db, fixture.outletA.id, latte)).toBe(70);
    expect(await stockOf(container.db, fixture.outletA.id, fries)).toBe(70);
  });

  it("creates exactly one sale for parallel retries with the same Idempotency-Key", async () => {
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => sell([{ menuItemId: fixture.items.latte, quantity: 2 }], { key })),
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    const replays = responses.filter((response) => response.status === 200);
    expect(replays).toHaveLength(7);
    for (const replay of replays) expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
    expect(await stockOf(container.db, fixture.outletA.id, fixture.items.latte)).toBe(98);
  });

  it("rolls back a failed sale completely, including its receipt number", async () => {
    const ok1 = await sell([{ menuItemId: fixture.items.latte, quantity: 1 }]);
    const failed = await sell([
      { menuItemId: fixture.items.latte, quantity: 1 },
      { menuItemId: fixture.items.burger, quantity: 26 },
    ]);
    const ok2 = await sell([{ menuItemId: fixture.items.latte, quantity: 1 }]);

    expect(failed.status).toBe(409);
    expect(failed.body.error.details.shortfalls).toEqual([
      { menuItemId: fixture.items.burger, requested: 26, available: 25 },
    ]);
    expect([ok1.body.receiptSeq, ok2.body.receiptSeq]).toEqual([1, 2]);
    // The latte line of the failed sale was not deducted either.
    expect(await stockOf(container.db, fixture.outletA.id, fixture.items.latte)).toBe(98);
  });

  it("prices lines with the outlet's effective price and merges repeated items", async () => {
    const response = await sell([
      { menuItemId: fixture.items.latte, quantity: 1 },
      { menuItemId: fixture.items.fries, quantity: 2 },
      { menuItemId: fixture.items.latte, quantity: 2 },
    ]);
    expect(response.status).toBe(201);
    expect(response.body.lines).toHaveLength(2);
    const latte = response.body.lines.find((line: { sku: string }) => line.sku === "LATTE");
    expect(latte).toMatchObject({ quantity: 3, unitPriceMinor: 32_000, lineTotalMinor: 96_000 });
    expect(response.body.totalMinor).toBe(96_000 + 2 * 18_000);
    expect(response.body.itemCount).toBe(5);
  });

  it("rejects items that are not on the outlet's menu", async () => {
    const response = await sell([{ menuItemId: fixture.items.cake, quantity: 1 }]);
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: "ITEMS_NOT_SELLABLE",
      details: { menuItemIds: [fixture.items.cake] },
    });
  });
});
