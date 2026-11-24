import { cva } from "class-variance-authority";

/** Button styles, shared by <Button> and links that look like buttons. */
export const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-(--motion-fast) ease-(--ease-press) outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-disabled:scale-(--press-scale) disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-(--shadow-sm) hover:bg-[color-mix(in_oklch,var(--primary),black_10%)] dark:hover:bg-[color-mix(in_oklch,var(--primary),white_8%)]",
        outline:
          "border-border bg-card shadow-(--shadow-sm) hover:bg-muted aria-expanded:bg-muted dark:bg-transparent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]",
        ghost: "text-foreground/80 hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/16 focus-visible:ring-destructive/30",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-(--control-h) px-(--control-px)",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-(--control-h-sm) px-2.5 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-(--control-h-lg) px-4 text-[0.9375rem]",
        icon: "size-(--control-h)",
        "icon-sm": "size-(--control-h-sm)",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
