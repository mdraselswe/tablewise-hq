import { cn } from "cn";

/** The Tablewise mark: a table seen from above, with one seat taken. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M9 11h14M16 11v12"
        className="stroke-primary-foreground"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="22.5" cy="21.5" r="2.5" className="fill-gold" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-[0.9375rem] font-semibold tracking-tight">Tablewise</span>
    </span>
  );
}
