import { cn } from "cn";
import { motion } from "motion/react";
import { useId } from "react";

/**
 * A row of mutually exclusive options (date presets, payment method). The active
 * background is a shared layout element, so it glides between options.
 */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "default",
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: React.ReactNode }[];
  size?: "default" | "sm" | "lg";
  className?: string;
  "aria-label": string;
}) {
  const layoutId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-secondary p-0.5", className)}
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        const index = options.findIndex((option) => option.value === value);
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next = options[(index + step + options.length) % options.length];
        if (next) onChange(next.value);
        event.preventDefault();
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex-1 rounded-md px-3 font-medium whitespace-nowrap transition-colors duration-(--motion-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&_svg]:size-4",
              size === "sm" && "h-7 px-2.5 text-xs",
              size === "default" && "h-8 text-[0.8125rem]",
              size === "lg" && "h-10 text-sm",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-card shadow-(--shadow-card)"
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              />
            ) : null}
            <span className="relative inline-flex items-center justify-center gap-1.5">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { Segmented };
