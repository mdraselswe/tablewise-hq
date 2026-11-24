import { useState } from "react";

const EMPTY: ReadonlySet<string> = new Set();

interface State {
  scope: string;
  signature: string;
  known: Set<string>;
  fresh: ReadonlySet<string>;
}

/**
 * Ids that appeared in a list after it first loaded (for example a sale pushed by
 * the live stream), so the UI can highlight them once. Changing `scope` (a new
 * page or filter) starts over, so paging never highlights a whole page.
 */
export function useFreshIds(ids: readonly string[] | undefined, scope: string): ReadonlySet<string> {
  const [state, setState] = useState<State | null>(null);
  if (!ids) return EMPTY;
  const signature = ids.join(",");
  if (!state || state.scope !== scope) {
    setState({ scope, signature, known: new Set(ids), fresh: EMPTY });
  } else if (state.signature !== signature) {
    const fresh = new Set(ids.filter((id) => !state.known.has(id)));
    setState({ scope, signature, known: new Set([...state.known, ...ids]), fresh });
  }
  return state?.scope === scope ? state.fresh : EMPTY;
}
