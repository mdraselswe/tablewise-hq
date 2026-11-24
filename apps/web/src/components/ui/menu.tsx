import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import type { ReactNode } from "react";

const Menu = MenuPrimitive.Root;

function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger {...props} />;
}

function MenuContent({
  children,
  align = "end",
  side = "bottom",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} side={side} sideOffset={6} className="z-60 outline-none">
        <MenuPrimitive.Popup
          className={cn(
            "min-w-48 origin-(--transform-origin) rounded-lg border bg-popover p-1 text-popover-foreground shadow-(--shadow-overlay) transition-[opacity,scale] duration-(--motion-fast) ease-(--ease-ui) outline-none data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
            className,
          )}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function MenuSeparator() {
  return <MenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />;
}

function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">{children}</div>;
}

export { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger };
