import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createFixture, createTestContext, type Fixture, truncateAll } from "./helpers.ts";

describe("authentication, authorization and validation", () => {
  const context = createTestContext();
  const { app, container } = context;
  let fixture: Fixture;
  let hqToken: string;
  let tokenA: string;

  beforeAll(async () => {
    await truncateAll(container.db);
    fixture = await createFixture(container);
    hqToken = await fixture.token(fixture.hq);
    tokenA = await fixture.token(fixture.staffA);
  });

  afterAll(() => context.close());

  it("signs in with a cookie and a token, and rejects wrong passwords with one generic message", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "A@TEST.LOCAL", password: "password-123" });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ role: "OUTLET_STAFF", outletId: fixture.outletA.id });
    expect(String(login.headers["set-cookie"])).toMatch(/tw_session=.+HttpOnly/);

    const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.body.email).toBe("a@test.local");

    const wrong = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "a@test.local", password: "nope-nope-1" });
    const unknown = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "x@test.local", password: "nope-nope-1" });
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it("requires a session for everything except public routes", async () => {
    const response = await api(app).get("/outlets");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect((await api(app, "not-a-token").get("/outlets")).status).toBe(401);
  });

  it("keeps outlet staff inside their own outlet", async () => {
    expect((await api(app, tokenA).get(`/outlets/${fixture.outletB.id}/menu`)).status).toBe(403);
    expect((await api(app, tokenA).get(`/outlets/${fixture.outletB.id}/inventory`)).status).toBe(403);
    const sale = await api(app, tokenA).post(`/outlets/${fixture.outletB.id}/sales`, {
      lines: [{ menuItemId: fixture.items.latte, quantity: 1 }],
      paymentMethod: "CASH",
    });
    expect(sale.status).toBe(403);
    expect((await api(app, tokenA).get(`/reports/revenue?outletId=${fixture.outletB.id}`)).status).toBe(403);

    const outlets = await api(app, tokenA).get("/outlets");
    expect(outlets.body.map((outlet: { id: string }) => outlet.id)).toEqual([fixture.outletA.id]);
  });

  it("reserves HQ actions for HQ and selling for outlets", async () => {
    expect((await api(app, tokenA).get("/menu-items")).status).toBe(403);
    expect((await api(app, tokenA).post("/outlets", { code: "ZZZ", name: "Nope" })).status).toBe(403);
    const hqSale = await api(app, hqToken).post(`/outlets/${fixture.outletA.id}/sales`, {
      lines: [{ menuItemId: fixture.items.latte, quantity: 1 }],
      paymentMethod: "CASH",
    });
    expect(hqSale.status).toBe(403);
  });

  it("hides another outlet's sale behind a 404", async () => {
    const tokenB = await fixture.token(fixture.staffB);
    const sale = await api(app, tokenB).post(`/outlets/${fixture.outletB.id}/sales`, {
      lines: [{ menuItemId: fixture.items.cake, quantity: 1 }],
      paymentMethod: "CARD",
    });
    expect(sale.status).toBe(201);
    expect((await api(app, tokenA).get(`/sales/${sale.body.id}`)).status).toBe(404);
    expect((await api(app, hqToken).get(`/sales/${sale.body.id}`)).status).toBe(200);
  });

  it("returns every validation issue with its path", async () => {
    const response = await api(app, tokenA).post(`/outlets/${fixture.outletA.id}/sales`, {
      lines: [{ menuItemId: "not-a-uuid", quantity: 0 }],
      paymentMethod: "BITCOIN",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    const paths = response.body.error.details.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining(["body.lines.0.menuItemId", "body.lines.0.quantity", "body.paymentMethod"]),
    );
  });

  it("rejects a malformed Idempotency-Key and a malformed JSON body", async () => {
    const badKey = await api(app, tokenA)
      .post(`/outlets/${fixture.outletA.id}/sales`, {
        lines: [{ menuItemId: fixture.items.latte, quantity: 1 }],
        paymentMethod: "CASH",
      })
      .set("Idempotency-Key", "123");
    expect(badKey.status).toBe(400);

    const badJson = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": ');
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.message).toBe("Malformed JSON body");
  });

  it("serves an OpenAPI document generated from the routes", async () => {
    const response = await request(app).get("/api/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.paths["/api/v1/outlets/{outletId}/sales"].post.summary).toBe("Record a sale");
  });
});
