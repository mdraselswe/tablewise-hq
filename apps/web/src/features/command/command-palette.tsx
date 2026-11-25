import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import {
  CornerDownLeft,
  LogOut,
  type LucideIcon,
  Moon,
  Plus,
  Search,
  Store,
  Sun,
  UtensilsCrossed,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { menuItemsQuery, outletsQuery } from "@/api/resources.ts";
import { navFor } from "@/app/navigation.ts";
import { overlayClass } from "@/components/ui/dialog.tsx";
import { Kbd } from "@/components/ui/misc.tsx";
import { isHq, useLogout, useSessionUser } from "@/features/auth/session.ts";
import { toggleTheme, useTheme } from "@/hooks/use-theme.ts";
import { formatMoney } from "@/lib/format.ts";
import { fuzzyScore } from "@/lib/fuzzy.ts";
import { onOpenCommandPalette } from "./command-bus.ts";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const user = useSessionUser();
  const navigate = useNavigate();
  const logout = useLogout();
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const hq = isHq(user);

  useEffect(() => {
    const stop = onOpenCommandPalette(() => setOpen(true));
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stop();
    };
  }, []);

  const outlets = useQuery({ ...outletsQuery, enabled: open && hq });
  // Menu items are searched on the server, so every item is reachable however large the menu grows.
  const itemSearch = useDeferredValue(query.trim());
  const items = useQuery({
    ...menuItemsQuery({ search: itemSearch, pageSize: 20, status: "all" }),
    enabled: open && hq && itemSearch.length > 0,
  });

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => void navigate(to);
    const list: Command[] = navFor(user).map((item) => ({
      id: `nav:${item.to}`,
      group: "Go to",
      label: item.label,
      icon: item.icon,
      run: go(item.to),
    }));
    if (hq) {
      list.push(
        { id: "new-item", group: "Actions", label: "New menu item", icon: Plus, run: go("/hq/menu?new=1") },
        { id: "new-outlet", group: "Actions", label: "New outlet", icon: Plus, run: go("/hq/outlets?new=1") },
      );
      for (const outlet of outlets.data ?? []) {
        list.push({
          id: `outlet:${outlet.id}`,
          group: "Outlets",
          label: outlet.name,
          hint: outlet.code,
          keywords: outlet.code,
          icon: Store,
          run: go(`/hq/outlets/${outlet.id}`),
        });
      }
      for (const item of items.data?.items ?? []) {
        list.push({
          id: `item:${item.id}`,
          group: "Menu items",
          label: item.name,
          hint: `${item.sku} · ${formatMoney(item.basePriceMinor)}`,
          keywords: `${item.sku} ${item.category}`,
          icon: UtensilsCrossed,
          run: go(`/hq/menu?item=${item.id}`),
        });
      }
    }
    list.push(
      {
        id: "theme",
        group: "Preferences",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: theme === "dark" ? Sun : Moon,
        keywords: "dark light mode appearance",
        run: toggleTheme,
      },
      { id: "logout", group: "Preferences", label: "Sign out", icon: LogOut, run: () => logout.mutate() },
    );
    return list;
  }, [user, hq, outlets.data, items.data, theme, navigate, logout]);

  const results = useMemo(() => {
    const scored = commands
      .map((command) => ({
        command,
        score: fuzzyScore(query, `${command.label} ${command.keywords ?? ""} ${command.hint ?? ""}`),
      }))
      .filter((entry) => entry.score > 0);
    // Without a query, hide the long item list; it is there to be searched.
    const visible = query ? scored : scored.filter((entry) => entry.command.group !== "Menu items");
    if (query) visible.sort((a, b) => b.score - a.score);
    return visible.slice(0, 40).map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const setOpenAndReset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  };

  const run = (command: Command | undefined) => {
    if (!command) return;
    setOpenAndReset(false);
    command.run();
  };

  // Groups in the order they first appear in the ranked results.
  const groups: [string, { command: Command; index: number }[]][] = [];
  results.forEach((command, index) => {
    const group = groups.find(([name]) => name === command.group);
    if (group) group[1].push({ command, index });
    else groups.push([command.group, [{ command, index }]]);
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpenAndReset}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={overlayClass} />
        <DialogPrimitive.Popup
          aria-label="Command palette"
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-(--shadow-overlay) transition-[opacity,scale] duration-(--motion-base) ease-(--ease-ui) outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
        >
          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") setActive((index) => Math.min(index + 1, results.length - 1));
                else if (event.key === "ArrowUp") setActive((index) => Math.max(index - 1, 0));
                else if (event.key === "Enter") run(results[active]);
                else return;
                event.preventDefault();
              }}
              placeholder={hq ? "Search pages, outlets, menu items…" : "Search pages and actions…"}
              aria-label="Search commands"
              aria-controls="command-results"
              aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
              role="combobox"
              aria-expanded="true"
              className="h-12 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-muted-foreground"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div
            ref={listRef}
            id="command-results"
            role="listbox"
            className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
          >
            {results.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                No results for “{query}”.
              </p>
            ) : (
              groups.map(([group, entries]) => (
                <div key={group} role="group" aria-label={group} className="pb-1">
                  <div className="px-2.5 pt-2 pb-1 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
                    {group}
                  </div>
                  {entries.map(({ command, index }) => {
                    const Icon = command.icon;
                    return (
                      <div
                        key={command.id}
                        id={`command-${command.id}`}
                        role="option"
                        aria-selected={index === active}
                        data-index={index}
                        onMouseMove={() => setActive(index)}
                        onClick={() => run(command)}
                        className={cn(
                          "flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-sm",
                          index === active && "bg-muted",
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate">{command.label}</span>
                        {command.hint ? (
                          <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">
                            {command.hint}
                          </span>
                        ) : null}
                        {index === active ? (
                          <CornerDownLeft
                            className={cn(
                              "size-3.5 shrink-0 text-muted-foreground",
                              !command.hint && "ml-auto",
                            )}
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
