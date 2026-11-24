import { useSyncExternalStore } from "react";

/*
 * One shared clock for every timer on screen (kitchen tickets, "3 min ago"), so
 * fifty tickets cause one re-render per tick instead of fifty intervals.
 */
const subscribers = new Map<number, Set<() => void>>();
const timers = new Map<number, ReturnType<typeof setInterval>>();
const snapshots = new Map<number, number>();

function subscribe(intervalMs: number, listener: () => void): () => void {
  let set = subscribers.get(intervalMs);
  if (!set) {
    set = new Set();
    subscribers.set(intervalMs, set);
    snapshots.set(intervalMs, Date.now()); // a clock that restarts must not show an old time
    timers.set(
      intervalMs,
      setInterval(() => {
        snapshots.set(intervalMs, Date.now());
        for (const fn of subscribers.get(intervalMs) ?? []) fn();
      }, intervalMs),
    );
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      clearInterval(timers.get(intervalMs));
      timers.delete(intervalMs);
      subscribers.delete(intervalMs);
    }
  };
}

/** The snapshot must stay identical between ticks, or React re-renders forever. */
function snapshot(intervalMs: number): number {
  let value = snapshots.get(intervalMs);
  if (value === undefined) {
    value = Date.now();
    snapshots.set(intervalMs, value);
  }
  return value;
}

/** One stable subscribe function per interval, so React never resubscribes on re-render. */
const subscribeFns = new Map<number, (listener: () => void) => () => void>();
function subscriberFor(intervalMs: number) {
  let fn = subscribeFns.get(intervalMs);
  if (!fn) {
    fn = (listener) => subscribe(intervalMs, listener);
    subscribeFns.set(intervalMs, fn);
  }
  return fn;
}

export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(subscriberFor(intervalMs), () => snapshot(intervalMs));
}
