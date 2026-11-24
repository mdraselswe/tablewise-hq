import { cn } from "cn";
import type { ComponentProps } from "react";
import { Input } from "./input.tsx";

/** A text input for amounts with a currency prefix. The caller parses with parseMoney(). */
export function MoneyInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
        BDT
      </span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn("num pl-11", className)}
        {...props}
      />
    </div>
  );
}
