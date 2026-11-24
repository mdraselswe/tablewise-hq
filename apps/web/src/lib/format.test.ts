import { describe, expect, it } from "vitest";
import { addDays, formatElapsed, formatMoney, parseMoney } from "./format.ts";

describe("money formatting", () => {
  it("formats minor units without floating-point drift", () => {
    expect(formatMoney(125_050)).toBe("BDT 1,250.50");
    expect(formatMoney(30)).toBe("BDT 0.30");
    expect(formatMoney(125_050, { whole: true, currency: false })).toBe("1,251");
  });

  it("parses user input into minor units and rejects anything else", () => {
    expect(parseMoney("1,250.5")).toBe(125_050);
    expect(parseMoney("320")).toBe(32_000);
    expect(parseMoney("0.07")).toBe(7);
    expect(parseMoney("12.345")).toBeUndefined();
    expect(parseMoney("-5")).toBeUndefined();
    expect(parseMoney("abc")).toBeUndefined();
  });
});

describe("dates and timers", () => {
  it("adds days to a business date across month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats elapsed time as m:ss", () => {
    const start = "2026-11-24T10:00:00Z";
    expect(formatElapsed(start, Date.parse("2026-11-24T10:04:07Z"))).toBe("4:07");
    expect(formatElapsed(start, Date.parse("2026-11-24T09:59:00Z"))).toBe("0:00");
  });
});
