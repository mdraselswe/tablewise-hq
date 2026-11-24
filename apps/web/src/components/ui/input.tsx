import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import type { ComponentProps } from "react";

const fieldClass =
  "w-full min-w-0 rounded-md border border-input bg-card px-(--control-px) text-sm shadow-(--shadow-sm) transition-[border-color,box-shadow] duration-(--motion-fast) outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 dark:bg-input/20";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(fieldClass, "h-(--control-h)", type === "number" && "num", className)}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClass, "min-h-20 resize-y py-2", className)}
      {...props}
    />
  );
}

function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-[0.8125rem] leading-none font-medium text-foreground/90 select-none", className)}
      {...props}
    />
  );
}

/** Label, control and an optional hint or error, stacked. */
function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export { Field, Input, Label, Textarea };
