import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "tw-theme"; // also read by public/theme.js before first paint

const listeners = new Set<() => void>();
const read = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");

export function setTheme(theme: Theme): void {
  const apply = () => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
    for (const listener of listeners) listener();
  };
  // Cross-fade the whole page where the browser supports view transitions.
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}

export function toggleTheme(): void {
  setTheme(read() === "dark" ? "light" : "dark");
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => "light",
  );
}
