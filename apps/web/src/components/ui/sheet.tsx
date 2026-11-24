import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "./button.tsx";
import { overlayClass } from "./dialog.tsx";

const Sheet = SheetPrimitive.Root;
const SheetClose = SheetPrimitive.Close;

/** A panel that slides in from the right: details that keep the list behind them in view. */
function SheetContent({ className, children, ...props }: SheetPrimitive.Popup.Props) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop className={overlayClass} />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l bg-popover text-popover-foreground shadow-(--shadow-overlay) outline-none sm:max-w-md",
          "transition-[opacity,translate] duration-(--motion-slow) ease-(--ease-ui) data-ending-style:translate-x-8 data-ending-style:opacity-0 data-starting-style:translate-x-8 data-starting-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          render={<Button variant="ghost" size="icon-sm" className="absolute top-3.5 right-3.5" />}
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-1 border-b px-5 py-4 pr-12", className)} {...props} />;
}

function SheetBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}

function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex gap-2 border-t bg-muted/40 px-5 py-3.5", className)} {...props} />;
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title className={cn("text-base font-semibold tracking-tight", className)} {...props} />
  );
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle };
