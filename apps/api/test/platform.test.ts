import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createTestContext } from "./helpers.ts";

describe("single-container web app", () => {
  const dist = mkdtempSync(path.join(tmpdir(), "tablewise-web-"));
  mkdirSync(path.join(dist, "assets"));
  writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>Tablewise</title>");
  writeFileSync(path.join(dist, "assets", "app-abc123.js"), "export {};");
  const context = createTestContext({ WEB_DIST_DIR: dist });
  afterAll(() => context.close());

  it("serves the app shell for client-side routes on GET and HEAD", async () => {
    for (const route of ["/", "/pos", "/reports/top-items"]) {
      const get = await request(context.app).get(route);
      expect(get.status).toBe(200);
      expect(get.headers["content-type"]).toMatch(/text\/html/);

      // Uptime monitors probe with HEAD; a 404 here reads as "site down".
      const head = await request(context.app).head(route);
      expect(head.status).toBe(200);
      expect(head.headers["content-type"]).toMatch(/text\/html/);
    }
  });

  it("caches fingerprinted assets forever and keeps API misses as JSON", async () => {
    const asset = await request(context.app).get("/assets/app-abc123.js");
    expect(asset.headers["cache-control"]).toContain("immutable");

    const miss = await request(context.app).get("/api/v1/nope");
    expect(miss.status).toBe(404);
    expect(miss.body.error.code).toBe("NOT_FOUND");
  });
});
