import { cn } from "cn";
import type { ReactNode } from "react";

/** Standard page frame: title row with actions, then content. */
export function Page({
  title,
  description,
  actions,
  children,
  className,
  wide = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-8 sm:py-8",
        wide ? "max-w-[1600px]" : "max-w-7xl",
        className,
      )}
    >
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-[1.375rem]">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

/** Shown while a lazily loaded page arrives (normally a few milliseconds). */
export function PageFallback() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
      <div className="skeleton mb-2 h-7 w-48 rounded-md" />
      <div className="skeleton mb-8 h-4 w-72 rounded-md" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
