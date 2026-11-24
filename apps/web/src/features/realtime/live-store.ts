import { useSyncExternalStore } from "react";

export type ConnectionState = "connecting" | "live" | "offline";

/*
 * State of the live event stream, shown in the sidebar. Data that arrives over the
 * stream goes into the query cache, not here, so every screen reads one source.
 */
let connection: ConnectionState = "connecting";
const listeners = new Set<() => void>();

export const liveStore = {
  setConnection(next: ConnectionState) {
    if (next === connection) return;
    connection = next;
    for (const listener of listeners) listener();
  },
};

export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => connection,
  );
}
