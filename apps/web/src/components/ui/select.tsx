import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "cn";
import { CheckIcon, ChevronsUpDown } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * A single-choice select with a typed value. Wraps Base UI's Select so call sites
 * pass options instead of composing parts.
 */
function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = "Select",
  className,
  size = "default",
  "aria-label": ariaLabel,
  id,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  className?: string;
  size?: "default" | "sm";
  "aria-label"?: string;
  id?: string;
}) {
  const items = options.map((option) => ({ value: option.value, label: option.label }));
  return (
    <SelectPrimitive.Root
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next as T);
      }}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-md border border-input bg-card pr-2 pl-(--control-px) text-sm whitespace-nowrap shadow-(--shadow-sm) transition-[border-color,box-shadow] duration-(--motion-fast) outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 data-popup-open:border-ring dark:bg-input/20",
          size === "sm" ? "h-(--control-h-sm)" : "h-(--control-h)",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="truncate" />
        <SelectPrimitive.Icon render={<ChevronsUpDown className="size-3.5 text-muted-foreground" />} />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-60 outline-none">
          <SelectPrimitive.Popup className="max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-(--shadow-overlay) transition-[opacity,scale] duration-(--motion-fast) ease-(--ease-ui) data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-highlighted:bg-muted"
                >
                  <SelectPrimitive.ItemText className="flex flex-1 items-baseline gap-2">
                    {option.label}
                    {option.hint ? (
                      <span className="text-xs text-muted-foreground">{option.hint}</span>
                    ) : null}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2">
                    <CheckIcon className="size-3.5 text-primary" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { Select };
