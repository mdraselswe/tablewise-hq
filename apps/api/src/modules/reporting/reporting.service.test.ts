import { describe, expect, it } from "vitest";
import { addDays, todayIn } from "./reporting.service.ts";

describe("trading-day helpers", () => {
  it("uses the business time zone, not the server's, for 'today'", () => {
    // 20:30 UTC on 24 Nov is already 25 Nov in Dhaka (UTC+6).
    const instant = new Date("2026-11-24T20:30:00Z");
    expect(todayIn("Asia/Dhaka", instant)).toBe("2026-11-25");
    expect(todayIn("UTC", instant)).toBe("2026-11-24");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
});
