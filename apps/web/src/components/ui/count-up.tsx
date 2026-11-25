import { animate } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * A number that counts from its previous value to the new one, so a change of period or
 * a live sale is felt. The text is written straight to the node (no re-render per frame).
 * Screen readers get only the final value.
 */
export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  // Rendered once and never changed, so React leaves the text the effect writes alone.
  const [initial] = useState(() => format(0));

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        shown.current = latest;
        node.textContent = format(latest);
      },
    });
    return () => controls.stop();
  }, [value, format]);

  return (
    <span>
      <span ref={ref} aria-hidden="true">
        {initial}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
