import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-medium tracking-wide whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-secondary text-secondary-foreground",
        primary: "bg-accent text-accent-foreground",
        success: "bg-success/12 text-success",
        warning: "bg-warning/18 text-warning-foreground",
        danger: "bg-destructive/10 text-destructive",
        info: "bg-info/12 text-info",
        outline: "border text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** A small coloured dot with a label: status at a glance in dense tables. */
function StatusDot({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  const color = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    neutral: "bg-muted-foreground/50",
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.8125rem]">
      <span className={cn("size-1.5 rounded-full", color)} aria-hidden="true" />
      {children}
    </span>
  );
}

export { Badge, StatusDot };
