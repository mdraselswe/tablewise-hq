import { describe, expect, it } from "vitest";
import { niceMax, smoothPath } from "./chart.ts";

describe("niceMax", () => {
  it("rounds up to a tidy gridline maximum", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(87_000)).toBe(100_000);
    expect(niceMax(180)).toBe(200);
    expect(niceMax(2_100)).toBe(2_500);
  });
});

describe("smoothPath", () => {
  it("returns nothing for no points and a bare move for one", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([[10, 20]])).toBe("M10,20");
  });

  it("uses one cubic segment per gap so paths of equal length can morph", () => {
    const path = smoothPath([
      [0, 50],
      [10, 10],
      [20, 40],
      [30, 0],
    ]);
    expect(path.startsWith("M0,50")).toBe(true);
    expect(path.match(/C/g)).toHaveLength(3);
    expect(path.endsWith("30,0")).toBe(true);
  });

  it("never lets a control point overshoot its neighbours", () => {
    // A spike then a flat run: an unclamped curve would dip below y = 100 (below zero on a chart).
    const path = smoothPath([
      [0, 100],
      [10, 0],
      [20, 100],
      [30, 100],
    ]);
    const ys = [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((match) => Number(match[2]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });
});
