import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/hooks/use-theme.ts";

/** Toasts, styled from the theme tokens. Call `toast.success(...)` from anywhere. */
export function Toaster() {
  const theme = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      gap={8}
      icons={{
        success: <CircleCheck className="size-4 text-success" aria-hidden="true" />,
        info: <Info className="size-4 text-info" aria-hidden="true" />,
        warning: <TriangleAlert className="size-4 text-warning" aria-hidden="true" />,
        error: <OctagonX className="size-4 text-destructive" aria-hidden="true" />,
        loading: <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      toastOptions={{ classNames: { toast: "font-sans shadow-(--shadow-overlay)!" } }}
    />
  );
}
