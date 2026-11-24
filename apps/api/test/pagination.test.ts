import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api, createFixture, createTestContext, type Fixture, truncateAll } from "./helpers.ts";

/**
 * Lists over tables that grow without limit: keyset pages, capped totals and the
 * default windows that keep a bare request cheap.
 */
describe("pagination of large lists", () => {
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

  const sellLatte = () =>
    api(app, tokenA).post(`/outlets/${fixture.outletA.id}/sales`, {
      lines: [{ menuItemId: fixture.items.latte, quantity: 1 }],
      paymentMethod: "CASH",
    });

  /** Bulk sales straight into the table (receipt numbers far above the live counter): volume without thousands of HTTP calls. */
  const bulkSales = (outletId: string, count: number, daysAgo = 0) =>
    container.db.query(
      `INSERT INTO sales.sales (id, outlet_id, receipt_seq, receipt_no, payment_method, total_minor,
                                item_count, occurred_at, business_date)
       SELECT gen_random_uuid(), $1, 1000000 + g, 'BULK-' || $3::int || '-' || g, 'CASH', 1000, 1,
              now() - make_interval(days => $3::int) - make_interval(secs => g),
              ((now() - make_interval(days => $3::int)) AT TIME ZONE 'Asia/Dhaka')::date
         FROM generate_series(1, $2) AS g`,
      [outletId, count, daysAgo],
    );

  it("walks sales newest first with a cursor, without gaps or repeats, even while new sales arrive", async () => {
    for (let index = 0; index < 7; index += 1) expect((await sellLatte()).status).toBe(201);

    const first = await api(app, tokenA).get("/sales?pageSize=3");
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ pageSize: 3, total: 7, totalCapped: false });
    expect(first.body.items.map((sale: { receiptSeq: number }) => sale.receiptSeq)).toEqual([7, 6, 5]);

    // A sale made while the cashier reads page 1 must not shift page 2.
    expect((await sellLatte()).status).toBe(201);

    const second = await api(app, tokenA).get(`/sales?pageSize=3&cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((sale: { receiptSeq: number }) => sale.receiptSeq)).toEqual([4, 3, 2]);
    const third = await api(app, tokenA).get(`/sales?pageSize=3&cursor=${second.body.nextCursor}`);
    expect(third.body.items.map((sale: { receiptSeq: number }) => sale.receiptSeq)).toEqual([1]);
    expect(third.body.nextCursor).toBeNull();
  });

  it("caps the total at 1,000 and still pages deep into a large history", async () => {
    await bulkSales(fixture.outletB.id, 1_005);

    const first = await api(app, hqToken).get(`/sales?outletId=${fixture.outletB.id}&pageSize=100`);
    expect(first.body).toMatchObject({ total: 1_000, totalCapped: true });

    let cursor: string | null = first.body.nextCursor;
    const seen = new Set<string>(first.body.items.map((sale: { id: string }) => sale.id));
    while (cursor) {
      const page = await api(app, hqToken).get(
        `/sales?outletId=${fixture.outletB.id}&pageSize=100&cursor=${cursor}`,
      );
      for (const sale of page.body.items as { id: string }[]) seen.add(sale.id);
      cursor = page.body.nextCursor;
    }
    expect(seen.size).toBe(1_005);
  });

  it("lists the last 30 trading days unless a range is given", async () => {
    await bulkSales(fixture.outletA.id, 2, 45);
    expect((await sellLatte()).status).toBe(201);

    const byDefault = await api(app, tokenA).get("/sales");
    expect(byDefault.body.total).toBe(1);

    const older = await api(app, tokenA).get("/sales?from=2000-01-01");
    expect(older.body.total).toBe(3);
  });

  it("reads the stock audit trail in rolling windows with a cursor", async () => {
    for (let index = 0; index < 4; index += 1) expect((await sellLatte()).status).toBe(201);
    // Age the opening-stock movements of outlet A by 40 days.
    await container.db.query(
      `UPDATE inventory.stock_movements SET created_at = now() - interval '40 days'
        WHERE outlet_id = $1 AND reason = 'INITIAL'`,
      [fixture.outletA.id],
    );
    const path = `/outlets/${fixture.outletA.id}/inventory/movements`;

    const recent = await api(app, tokenA).get(`${path}?pageSize=3`);
    expect(recent.body).toMatchObject({ total: 4, totalCapped: false });
    const rest = await api(app, tokenA).get(`${path}?pageSize=3&cursor=${recent.body.nextCursor}`);
    expect(rest.body.items).toHaveLength(1);
    expect(rest.body.nextCursor).toBeNull();

    const quarter = await api(app, tokenA).get(`${path}?days=90`);
    expect(quarter.body.total).toBe(4 + 3); // plus the three opening-stock rows

    const odd = await api(app, tokenA).get(`${path}?days=14`);
    expect(odd.status).toBe(400);
  });

  it("finds master menu items that are not on an outlet's menu, and refuses absurd page numbers", async () => {
    const unassigned = await api(app, hqToken).get(`/menu-items?notAssignedTo=${fixture.outletA.id}`);
    expect(unassigned.body.items.map((item: { sku: string }) => item.sku)).toEqual(["CAKE"]);
    expect(unassigned.body.total).toBe(1);

    const tooDeep = await api(app, hqToken).get("/menu-items?page=1001");
    expect(tooDeep.status).toBe(400);
  });
});
