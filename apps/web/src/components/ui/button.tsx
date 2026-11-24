import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { LoaderCircle } from "lucide-react";
import { buttonVariants } from "./button-variants.ts";

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner, keeps the button's width and blocks clicks. */
    pending?: boolean;
  };

function Button({ className, variant, size, pending = false, disabled, children, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {pending ? (
        <>
          <span className="invisible inline-flex items-center gap-1.5">{children}</span>
          <LoaderCircle className="absolute animate-spin" aria-hidden="true" />
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
}

export { Button };
