import type { OutletMenuItem } from "@tablewise/contracts";
import { useCallback, useMemo, useReducer } from "react";

export interface CartLine {
  item: OutletMenuItem;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  /**
   * Idempotency key for the charge. It changes whenever the cart changes, and stays
   * the same while the same cart is retried, so a double tap or a network retry
   * never charges twice and a different cart is never mistaken for the old one.
   */
  key: string;
}

type Action =
  | { type: "add"; item: OutletMenuItem }
  | { type: "set"; menuItemId: string; quantity: number }
  | { type: "remove"; menuItemId: string }
  | { type: "clear" };

const MAX_QTY = 999;

function reducer(state: CartState, action: Action): CartState {
  const next = (lines: CartLine[]): CartState => ({ lines, key: crypto.randomUUID() });
  switch (action.type) {
    case "add": {
      const existing = state.lines.find((line) => line.item.menuItemId === action.item.menuItemId);
      if (existing) {
        return next(
          state.lines.map((line) =>
            line === existing ? { ...line, quantity: Math.min(line.quantity + 1, MAX_QTY) } : line,
          ),
        );
      }
      return next([...state.lines, { item: action.item, quantity: 1 }]);
    }
    case "set": {
      if (action.quantity <= 0)
        return next(state.lines.filter((line) => line.item.menuItemId !== action.menuItemId));
      return next(
        state.lines.map((line) =>
          line.item.menuItemId === action.menuItemId
            ? { ...line, quantity: Math.min(action.quantity, MAX_QTY) }
            : line,
        ),
      );
    }
    case "remove":
      return next(state.lines.filter((line) => line.item.menuItemId !== action.menuItemId));
    case "clear":
      return next([]);
  }
}

export function useCart() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ lines: [], key: crypto.randomUUID() }));
  const totals = useMemo(
    () => ({
      // Display only. The server prices every line again from the outlet's menu.
      totalMinor: state.lines.reduce((sum, line) => sum + line.item.priceMinor * line.quantity, 0),
      itemCount: state.lines.reduce((sum, line) => sum + line.quantity, 0),
    }),
    [state.lines],
  );
  const quantities = useMemo(
    () => new Map(state.lines.map((line) => [line.item.menuItemId, line.quantity])),
    [state.lines],
  );
  return {
    lines: state.lines,
    idempotencyKey: state.key,
    quantities,
    ...totals,
    add: useCallback((item: OutletMenuItem) => dispatch({ type: "add", item }), []),
    setQuantity: useCallback(
      (menuItemId: string, quantity: number) => dispatch({ type: "set", menuItemId, quantity }),
      [],
    ),
    remove: useCallback((menuItemId: string) => dispatch({ type: "remove", menuItemId }), []),
    clear: useCallback(() => dispatch({ type: "clear" }), []),
  };
}
