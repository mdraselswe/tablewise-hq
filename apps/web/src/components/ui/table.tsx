import { cn } from "cn";
import type { ComponentProps } from "react";

/** Dense, calm tables: hairline rows, muted headers, numbers right-aligned and tabular. */
function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
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
