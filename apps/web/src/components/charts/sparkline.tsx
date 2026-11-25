import { motion } from "motion/react";
import { useId } from "react";
import { smoothPath } from "@/lib/chart.ts";

const WIDTH = 100;
const HEIGHT = 32;
const EASE = [0.22, 1, 0.36, 1] as const;

/** A tiny trend line for a KPI card. Wipes in on first view and glides when the data changes. */
export function Sparkline({
  values,
  color = "var(--chart-1)",
  label,
}: {
  values: number[];
  color?: string;
  label: string;
}) {
  const clipId = useId();
  if (values.length < 2) return <div className="h-8" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map(
    (value, index) =>
      [(index / (values.length - 1)) * WIDTH, HEIGHT - 3 - ((value - min) / span) * (HEIGHT - 8)] as const,
  );
  const line = smoothPath(points);
  const area = `${line}L${WIDTH},${HEIGHT}L0,${HEIGHT}Z`;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="block h-8 w-full overflow-visible"
      role="img"
      aria-label={label}
    >
      {/* A clip wipe rather than pathLength: the stroke does not scale with the stretched
          viewBox, and a pathLength dash would then leave gaps in the line. */}
      <clipPath id={clipId}>
        <motion.rect
          x={-2}
          y={-4}
          height={HEIGHT + 8}
          initial={{ width: 0 }}
          animate={{ width: WIDTH + 4 }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <motion.path
          fill={color}
          fillOpacity={0.08}
          initial={{ d: area }}
          animate={{ d: area }}
          transition={{ duration: 0.6, ease: EASE }}
        />
        <motion.path
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ d: line }}
          animate={{ d: line }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </g>
    </svg>
  );
}
