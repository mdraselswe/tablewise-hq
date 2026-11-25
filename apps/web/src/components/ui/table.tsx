import { cn } from "cn";
import type { ComponentProps } from "react";

/**
 * Dense, calm tables: hairline rows, muted headers, numbers right-aligned and tabular.
 *
 * `stickyHeader` keeps the column names under the top bar while a long table scrolls.
 * A sideways-scrolling box would trap a sticky header inside it, so from 1280px up, where
 * every table here fits, the box clips instead of scrolling; narrower screens keep the
 * sideways scroll (and phones get lists instead of these tables anyway).
 */
function Table({
  className,
  stickyHeader = false,
  ...props
}: ComponentProps<"table"> & { stickyHeader?: boolean }) {
  return (
    <div
      className={cn(
        "relative w-full overflow-x-auto",
        stickyHeader &&
          "xl:overflow-x-clip xl:[&_th]:sticky xl:[&_th]:top-(--shell-top) xl:[&_th]:z-10 xl:[&_th]:bg-card xl:[&_th]:shadow-[inset_0_-1px_0_var(--border)]",
      )}
    >
      <table className={cn("w-full caption-bottom border-collapse text-[0.8125rem]", className)} {...props} />
    </div>
  );
}

function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TR({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border/70 transition-colors duration-(--motion-fast) data-[clickable=true]:cursor-pointer data-[clickable=true]:hover:bg-muted/60",
        className,
      )}
      {...props}
    />
  );
}

function TH({ className, numeric, ...props }: ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "h-9 px-3 text-left align-middle text-[0.6875rem] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase first:pl-5 last:pr-5",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

function TD({ className, numeric, ...props }: ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      className={cn("h-11 px-3 align-middle first:pl-5 last:pr-5", numeric && "num text-right", className)}
      {...props}
    />
  );
}

export { Table, TBody, TD, TH, THead, TR };
