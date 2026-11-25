import { useSyncExternalStore } from "react";

const STORAGE_KEY = "tw-sidebar";
const listeners = new Set<() => void>();

function stored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

let collapsed: boolean | undefined;
const read = (): boolean => (collapsed ??= stored());

/** Collapses or expands the desktop sidebar and remembers the choice on this device. */
export function setSidebarCollapsed(next: boolean): void {
  collapsed = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "collapsed" : "expanded");
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
  for (const listener of listeners) listener();
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => false,
  );
}
