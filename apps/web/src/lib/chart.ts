/** Rounds a maximum up to 1, 2, 2.5 or 5 times a power of ten, for tidy gridlines. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value) ?? 10;
  return step * power;
}

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * A smooth SVG path through the points (Catmull-Rom turned into cubic Béziers), so a
 * trend reads as a trend rather than a zigzag. Every segment is one `C` command, so two
 * paths with the same number of points can be morphed into each other.
 */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  const first = points[0];
  if (!first) return "";
  let path = `M${round(first[0])},${round(first[1])}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p1 = points[index] ?? first;
    const p0 = points[index - 1] ?? p1;
    const p2 = points[index + 1] ?? p1;
    const p3 = points[index + 2] ?? p2;
    // Clamp control points vertically between their neighbours so the curve never overshoots below zero.
    const c1y = Math.min(
      Math.max(p1[1] + (p2[1] - p0[1]) / 6, Math.min(p1[1], p2[1])),
      Math.max(p1[1], p2[1]),
    );
    const c2y = Math.min(
      Math.max(p2[1] - (p3[1] - p1[1]) / 6, Math.min(p1[1], p2[1])),
      Math.max(p1[1], p2[1]),
    );
    path += ` C${round(p1[0] + (p2[0] - p0[0]) / 6)},${round(c1y)} ${round(p2[0] - (p3[0] - p1[0]) / 6)},${round(c2y)} ${round(p2[0])},${round(p2[1])}`;
  }
  return path;
}
