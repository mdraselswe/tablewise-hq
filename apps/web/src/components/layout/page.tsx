import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * The frame every page shares, so width, padding and spacing never differ between pages.
 * It fills the screen up to `--page-max`: a narrower cap left wide margins on desktops.
 */
export const PAGE_FRAME = "mx-auto w-full max-w-(--page-max) px-4 py-6 sm:px-6 lg:px-8 lg:py-8";

/** Standard page: title row with actions, then the content blocks `--page-gap` apart. */
export function Page({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(PAGE_FRAME, className)}>
      <header className="mb-(--page-gap) flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-[1.375rem] font-semibold tracking-tight sm:text-[1.625rem]">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div> : null}
      </header>
      <div className="grid min-w-0 gap-(--page-gap)">{children}</div>
    </div>
  );
}

/** Shown while a lazily loaded page arrives (normally a few milliseconds). */
export function PageFallback() {
  return (
    <div className={PAGE_FRAME}>
      <div className="skeleton mb-2 h-7 w-48 rounded-md" />
      <div className="skeleton mb-(--page-gap) h-4 w-72 rounded-md" />
      <div className="grid gap-(--page-gap) sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton h-32 rounded-(--radius-card)" />
        ))}
      </div>
    </div>
  );
}
