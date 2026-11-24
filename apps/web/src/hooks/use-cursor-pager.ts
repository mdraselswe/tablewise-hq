import { useState } from "react";

/**
 * Newer/older navigation over a keyset-paginated list. The server only knows "the
 * page after this cursor", so going back is a stack of the cursors already used.
 * Changing `resetKey` (the filters) starts again from the newest page.
 */
export function useCursorPager(resetKey: string) {
  const [state, setState] = useState<{ key: string; stack: string[] }>({ key: resetKey, stack: [] });
  if (state.key !== resetKey) setState({ key: resetKey, stack: [] });
  const stack = state.key === resetKey ? state.stack : [];

  return {
    /** Cursor for the current page; undefined on the newest page. */
    cursor: stack.at(-1),
    /** 1 on the newest page. */
    pageNumber: stack.length + 1,
    hasPrevious: stack.length > 0,
    next: (nextCursor: string) => setState({ key: resetKey, stack: [...stack, nextCursor] }),
    previous: () => setState({ key: resetKey, stack: stack.slice(0, -1) }),
  };
}
