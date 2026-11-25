import type { RevenueTrendPoint } from "@tablewise/contracts";
import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { useElementWidth } from "@/hooks/use-element-width.ts";
import { niceMax, smoothPath } from "@/lib/chart.ts";
import { formatBusinessDate, formatCount, formatMoney, formatMoneyCompact } from "@/lib/format.ts";

// Shorter on phones so the chart does not fill the whole screen.
const heightFor = (width: number) => (width < 480 ? 210 : 260);
const PAD = { top: 16, right: 12, bottom: 30, left: 56 };
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Daily revenue as an area chart, with the previous period as a dashed line for
 * comparison. Hand-rolled SVG (about 200 lines) instead of a chart library: two series
 * do not justify ~100 kB of JavaScript, and the colours come straight from the theme.
 */
export function RevenueChart({
  points,
  previous,
}: {
  points: RevenueTrendPoint[];
  /** The same number of days just before `points`, matched by position. */
  previous?: RevenueTrendPoint[] | undefined;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const HEIGHT = heightFor(width);

  const chart = useMemo(() => {
    const innerWidth = Math.max(width - PAD.left - PAD.right, 1);
    const innerHeight = HEIGHT - PAD.top - PAD.bottom;
    const compare = previous && previous.length === points.length ? previous : undefined;
    const max = niceMax(
      Math.max(
        ...points.map((point) => point.revenueMinor),
        ...(compare ?? []).map((p) => p.revenueMinor),
        0,
      ),
    );
    const x = (index: number) =>
      PAD.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight;
    const coords = points.map((point, index) => [x(index), y(point.revenueMinor)] as const);
    const line = smoothPath(coords);
    const compareLine = compare
      ? smoothPath(compare.map((point, index) => [x(index), y(point.revenueMinor)] as const))
      : "";
    const first = coords[0];
    const last = coords.at(-1);
    const area = first && last ? `${line}L${last[0]},${y(0)}L${first[0]},${y(0)}Z` : "";
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
      value: max * fraction,
      y: y(max * fraction),
    }));
    const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerWidth / 76))));
    return { coords, line, compare, compareLine, area, ticks, labelEvery, innerWidth, x };
  }, [points, previous, width, HEIGHT]);

  const active = hover === null ? undefined : points[hover];
  const activePrevious = hover === null ? undefined : chart.compare?.[hover];
  const activeCoord = hover === null ? undefined : chart.coords[hover];
  // Remount the lines (and draw them in again) when the number of days changes; same length morphs.
  const shape = `${points.length}`;

  return (
    <div ref={ref} className="relative w-full touch-pan-y select-none" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Daily revenue for ${points.length} days${chart.compare ? ", with the previous period" : ""}`}
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
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {chart.ticks.map((tick, index) => (
            <g key={index}>
              <motion.line
                x1={PAD.left}
                x2={width - PAD.right}
                initial={false}
                animate={{ y1: tick.y, y2: tick.y }}
                stroke="var(--chart-grid)"
                strokeDasharray={index === 0 ? undefined : "3 5"}
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
            key={`area-${shape}`}
            fill={`url(#${gradientId})`}
            initial={{ opacity: 0, d: chart.area }}
            animate={{ opacity: 1, d: chart.area }}
            transition={{ opacity: { duration: 0.6, delay: 0.25 }, d: { duration: 0.7, ease: EASE } }}
          />
          {chart.compare ? (
            <motion.path
              key={`previous-${shape}`}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.55}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              initial={{ opacity: 0, d: chart.compareLine }}
              animate={{ opacity: 1, d: chart.compareLine }}
              transition={{ opacity: { duration: 0.5, delay: 0.4 }, d: { duration: 0.7, ease: EASE } }}
            />
          ) : null}
          <motion.path
            key={`line-${shape}`}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ pathLength: 0, d: chart.line }}
            animate={{ pathLength: 1, d: chart.line }}
            transition={{ pathLength: { duration: 1, ease: EASE }, d: { duration: 0.7, ease: EASE } }}
          />
          {activeCoord ? (
            <g>
              <line
                x1={activeCoord[0]}
                x2={activeCoord[0]}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="var(--foreground)"
                strokeOpacity="0.18"
                strokeDasharray="3 3"
              />
              <motion.circle
                initial={false}
                animate={{ cx: activeCoord[0], cy: activeCoord[1] }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                r={5}
                fill="var(--card)"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
              />
            </g>
          ) : null}
        </svg>
      ) : null}
      <AnimatePresence>
        {active && activeCoord ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, left: Math.min(Math.max(activeCoord[0] - 88, 0), width - 176) }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl border bg-popover px-3 py-2.5 text-xs shadow-(--shadow-overlay)"
          >
            <div className="font-medium text-muted-foreground">
              {formatBusinessDate(active.date, { weekday: true })}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-1" aria-hidden="true" />
                Revenue
              </span>
              <span className="num font-semibold">{formatMoney(active.revenueMinor, { whole: true })}</span>
            </div>
            <div className="num mt-0.5 flex justify-between gap-3 text-muted-foreground">
              <span>Sales</span>
              <span>{formatCount(active.saleCount)}</span>
            </div>
            {activePrevious ? (
              <div className="num mt-0.5 flex justify-between gap-3 text-muted-foreground">
                <span>Previous</span>
                <span>{formatMoney(activePrevious.revenueMinor, { whole: true })}</span>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
