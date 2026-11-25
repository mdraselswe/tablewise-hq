import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "cn";
import { type ComponentProps, type ReactNode, useState } from "react";

/** Placeholder with the size of the content it stands for. See .skeleton in globals.css. */
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("skeleton rounded-md", className)} {...props} />;
}

function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border bg-card px-1 font-sans text-[0.6875rem] font-medium text-muted-foreground shadow-[0_1px_0_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-(--motion-base) outline-none focus-visible:ring-3 focus-visible:ring-ring/40 data-checked:bg-primary data-disabled:opacity-50 data-unchecked:bg-input",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-4 rounded-full bg-white shadow-sm transition-transform duration-(--motion-base) ease-(--ease-ui) data-checked:translate-x-4 dark:data-checked:bg-primary-foreground" />
    </SwitchPrimitive.Root>
  );
}

const TooltipProvider = TooltipPrimitive.Provider;

function Tooltip({
  content,
  side = "top",
  children,
}: {
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={6} className="z-60">
          <TooltipPrimitive.Popup className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-(--shadow-overlay) transition-[opacity,scale] duration-(--motion-fast) data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function Card({
  className,
  interactive = false,
  ...props
}: ComponentProps<"section"> & { interactive?: boolean }) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-(--radius-card) bg-card shadow-(--shadow-card) transition-[box-shadow,translate,background-color] duration-(--motion-base) ease-(--ease-ui)",
        interactive && "hover:-translate-y-0.5 hover:shadow-(--shadow-lift)",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-5 pb-3", className)}
    >
      <div className="grid min-w-0 gap-0.5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-[0.8125rem] text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

function EmptyState({
  icon,
  title,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-1 grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <p className="font-medium">{title}</p>
      {children ? <div className="max-w-sm text-[0.8125rem] text-muted-foreground">{children}</div> : null}
    </div>
  );
}

/** Highlights its content briefly whenever `value` changes (not on first render): live updates are noticed. */
function FlashOnChange({ value, children }: { value: unknown; children: ReactNode }) {
  const [seen, setSeen] = useState({ value, version: 0 });
  if (!Object.is(seen.value, value)) setSeen({ value, version: seen.version + 1 });
  return (
    <span key={seen.version} className={cn("-mx-1 rounded px-1", seen.version > 0 && "flash")}>
      {children}
    </span>
  );
}

export { Card, CardHeader, EmptyState, FlashOnChange, Kbd, Skeleton, Switch, Tooltip, TooltipProvider };
