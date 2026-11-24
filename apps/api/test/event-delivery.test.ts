import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api, createFixture, createTestContext, type Fixture, truncateAll } from "./helpers.ts";

/**
 * Delivery guarantees of the outbox relay when a consumer misbehaves. This file
 * adds a deliberately flaky consumer, so it gets its own container.
 */
describe("event delivery with a failing consumer", () => {
  const context = createTestContext();
  const { app, container } = context;
  let fixture: Fixture;
  let tokenA: string;
  let hqToken: string;
  let flakyFails = true;
  let flakyCalls = 0;

  container.bus.subscribe("sales.sale.completed", "test.flaky", async () => {
    flakyCalls += 1;
    if (flakyFails) throw new Error("flaky consumer is down");
  });

  beforeEach(async () => {
    await truncateAll(container.db);
    fixture = await createFixture(container);
    tokenA = await fixture.token(fixture.staffA);
    hqToken = await fixture.token(fixture.hq);
    flakyFails = true;
    flakyCalls = 0;
  });

  afterAll(() => context.close());

  const sellLatte = () =>
    api(app, tokenA).post(`/outlets/${fixture.outletA.id}/sales`, {
      lines: [{ menuItemId: fixture.items.latte, quantity: 1 }],
      paymentMethod: "CASH",
    });

  const revenueOfA = async (): Promise<number> => {
    const response = await api(app, hqToken).get("/reports/revenue");
    return response.body.outlets.find((outlet: { outletCode: string }) => outlet.outletCode === "AAA")
      .revenueMinor;
  };

  const saleEvent = () =>
    container.db.one<{ id: string; attempts: number; published_at: Date | null; last_error: string | null }>(
      `SELECT id, attempts, published_at, last_error FROM platform.outbox_events
        WHERE event_type = 'sales.sale.completed'`,
    );

  it("keeps the other consumers' work when one consumer fails, and retries only that one", async () => {
    expect((await sellLatte()).status).toBe(201);
    await container.relay.drain();

    // Reporting projected the sale although the flaky consumer threw.
    expect(await revenueOfA()).toBe(32_000);
    const failed = await saleEvent();
    expect(failed).toMatchObject({ attempts: 1, published_at: null });
    expect(failed?.last_error).toContain("test.flaky: flaky consumer is down");

    // The consumer recovers; the retry delivers to it alone and reporting is not double-counted.
    flakyFails = false;
    await container.db.query("UPDATE platform.outbox_events SET available_at = now()");
    await container.relay.drain();

    expect((await saleEvent())?.published_at).not.toBeNull();
    expect(flakyCalls).toBe(2);
    expect(await revenueOfA()).toBe(32_000);
  });

  it("parks an event after the last attempt, reports it in health, and replays it on demand", async () => {
    expect((await sellLatte()).status).toBe(201);
    await container.relay.drain();
    // Fast-forward to the last allowed attempt instead of waiting for the backoff.
    await container.db.query("UPDATE platform.outbox_events SET attempts = 9, available_at = now()");
    await container.relay.drain();

    expect((await saleEvent())?.attempts).toBe(10);
    expect((await request(app).get("/health/ready")).body.parkedEvents).toBe(1);

    // Parked events are not retried by the relay on its own.
    await container.db.query("UPDATE platform.outbox_events SET available_at = now()");
    await container.relay.drain();
    expect((await saleEvent())?.published_at).toBeNull();

    flakyFails = false;
    expect(await container.relay.replayParked()).toBe(1);
    await container.relay.drain();

    expect((await saleEvent())?.published_at).not.toBeNull();
    expect((await request(app).get("/health/ready")).body.parkedEvents).toBe(0);
    expect(await revenueOfA()).toBe(32_000);
  });
});
