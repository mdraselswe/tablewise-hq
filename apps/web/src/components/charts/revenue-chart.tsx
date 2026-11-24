import type { RevenueTrendPoint } from "@tablewise/contracts";
import { motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { useElementWidth } from "@/hooks/use-element-width.ts";
import { niceMax } from "@/lib/chart.ts";
import { formatBusinessDate, formatCount, formatMoney, formatMoneyCompact } from "@/lib/format.ts";

const HEIGHT = 240;
const PAD = { top: 16, right: 12, bottom: 28, left: 64 };

/**
 * Daily revenue as an area chart. Hand-rolled SVG (about 150 lines) instead of a
 * chart library: one chart type does not justify ~100 kB of JavaScript, and the
 * colours come straight from the theme tokens.
 */
export function RevenueChart({ points }: { points: RevenueTrendPoint[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const chart = useMemo(() => {
    const innerWidth = Math.max(width - PAD.left - PAD.right, 1);
    const innerHeight = HEIGHT - PAD.top - PAD.bottom;
    const max = niceMax(Math.max(...points.map((point) => point.revenueMinor), 0));
    const x = (index: number) =>
      PAD.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight;
    const coords = points.map((point, index) => [x(index), y(point.revenueMinor)] as const);
    // Smooth curve (monotone-ish cubic) so the line reads as a trend, not a zigzag.
    const line = coords
      .map(([cx, cy], index) => {
        if (index === 0) return `M${cx},${cy}`;
        const [px, py] = coords[index - 1] ?? [cx, cy];
        const mid = (px + cx) / 2;
        return `C${mid},${py} ${mid},${cy} ${cx},${cy}`;
      })
      .join("");
    const first = coords[0];
    const last = coords.at(-1);
    const area = first && last ? `${line}L${last[0]},${y(0)}L${first[0]},${y(0)}Z` : "";
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
      value: max * fraction,
      y: y(max * fraction),
    }));
    const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerWidth / 72))));
    return { coords, line, area, ticks, labelEvery, innerWidth, x };
  }, [points, width]);

  const active = hover === null ? undefined : points[hover];
  const activeCoord = hover === null ? undefined : chart.coords[hover];

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Daily revenue for ${points.length} days`}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const px = event.clientX - rect.left - PAD.left;
            const index = points.length <= 1 ? 0 : Math.round((px / chart.innerWidth) * (points.length - 1));
            setHover(Math.min(Math.max(index, 0), points.length - 1));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {chart.ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--chart-grid)"
                strokeDasharray={tick.value === 0 ? undefined : "3 4"}
              />
              <text
                x={PAD.left - 10}
                y={tick.y}
                dy="0.32em"
                textAnchor="end"
                className="num fill-muted-foreground text-[11px]"
              >
                {formatMoneyCompact(tick.value).replace("BDT ", "")}
              </text>
            </g>
          ))}
          {points.map((point, index) =>
            index % chart.labelEvery === 0 || index === points.length - 1 ? (
              <text
                key={point.date}
                x={chart.x(index)}
                y={HEIGHT - 8}
                // Edge labels hug the plot so they never clip.
                textAnchor={
                  points.length > 1 && index === 0
                    ? "start"
                    : points.length > 1 && index === points.length - 1
                      ? "end"
                      : "middle"
                }
                className="fill-muted-foreground text-[11px]"
              >
                {formatBusinessDate(point.date)}
              </text>
            ) : null,
          )}
          <motion.path
            key={`area-${points.length}`}
            d={chart.area}
            fill={`url(#${gradientId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          />
          <motion.path
            key={`line-${points.length}`}
            d={chart.line}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1, d: chart.line }}
            transition={{ pathLength: { duration: 0.9, ease: [0.16, 1, 0.3, 1] }, d: { duration: 0.4 } }}
          />
          {activeCoord ? (
            <g>
              <line
                x1={activeCoord[0]}
                x2={activeCoord[0]}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="var(--foreground)"
                strokeOpacity="0.15"
              />
              <circle
                cx={activeCoord[0]}
                cy={activeCoord[1]}
                r={4.5}
                fill="var(--card)"
                stroke="var(--chart-1)"
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>
      ) : null}
      {active && activeCoord ? (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border bg-popover px-3 py-2 text-xs shadow-(--shadow-overlay)"
          style={{
            left: Math.min(Math.max(activeCoord[0] - 70, 0), width - 150),
          }}
        >
          <div className="font-medium">{formatBusinessDate(active.date, { weekday: true })}</div>
          <div className="num mt-1 text-sm font-semibold">{formatMoney(active.revenueMinor)}</div>
          <div className="num text-muted-foreground">{formatCount(active.saleCount)} sales</div>
        </div>
      ) : null}
    </div>
  );
}
