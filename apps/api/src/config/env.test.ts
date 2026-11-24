import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.ts";

const base = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  JWT_SECRET: "test-secret-that-is-long-enough-0123456789",
};

describe("loadEnv", () => {
  it("accepts IANA time zones, including aliases and UTC", () => {
    for (const zone of ["Asia/Dhaka", "Asia/Kolkata", "UTC"]) {
      expect(loadEnv({ ...base, BUSINESS_TIMEZONE: zone }).BUSINESS_TIMEZONE).toBe(zone);
    }
  });

  it("refuses to start with an unknown time zone instead of failing on the first report", () => {
    expect(() => loadEnv({ ...base, BUSINESS_TIMEZONE: "Asia/Dhakka" })).toThrow(/BUSINESS_TIMEZONE/);
  });
});
