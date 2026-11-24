import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ChevronsUpDown, LogOut, Menu as MenuIcon, Moon, Search, Sun } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigation } from "react-router";
import { outletsQuery } from "@/api/resources.ts";
import { navFor } from "@/app/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu.tsx";
import { Kbd } from "@/components/ui/misc.tsx";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet.tsx";
import { isHq, useLogout, useSessionUser } from "@/features/auth/session.ts";
import { showCommandPalette } from "@/features/command/command-bus.ts";
import { CommandPalette } from "@/features/command/command-palette.tsx";
import { type ConnectionState, useConnectionState } from "@/features/realtime/live-store.ts";
import { useLiveUpdates } from "@/features/realtime/use-live-updates.ts";
import { toggleTheme, useTheme } from "@/hooks/use-theme.ts";
import { initials } from "@/lib/format.ts";
import { Wordmark } from "./brand.tsx";

const CONNECTION_COPY: Record<ConnectionState, { label: string; className: string }> = {
  live: { label: "Live", className: "text-success" },
  connecting: { label: "Connecting", className: "text-warning" },
  offline: { label: "Offline", className: "text-destructive" },
};

function ConnectionBadge() {
  const connection = useConnectionState();
  const copy = CONNECTION_COPY[connection];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          copy.className,
          connection === "live" && "live-dot",
        )}
      />
      {copy.label}
    </span>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const user = useSessionUser();
  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {navFor(user).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end ?? false}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors duration-(--motion-fast)",
              isActive
                ? "bg-card text-foreground shadow-(--shadow-card)"
                : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon
                className={cn(
                  "size-4 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function UserMenu() {
  const user = useSessionUser();
  const logout = useLogout();
  const theme = useTheme();
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-foreground/[0.04] aria-expanded:bg-foreground/[0.04]"
          />
        }
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials(user.fullName)}
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-[0.8125rem] font-medium">{user.fullName}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-56">
        <MenuLabel>{isHq(user) ? "HQ administrator" : "Outlet staff"}</MenuLabel>
        <MenuItem onClick={toggleTheme}>
          {theme === "dark" ? <Sun /> : <Moon />}
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => logout.mutate()}>
          <LogOut />
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function Context() {
  const user = useSessionUser();
  const outlets = useQuery({ ...outletsQuery, enabled: !isHq(user) });
  const outlet = outlets.data?.find((candidate) => candidate.id === user.outletId);
  return (
    <div className="rounded-md border border-dashed px-2.5 py-2">
      <div className="text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
        {isHq(user) ? "Workspace" : "Outlet"}
      </div>
      <div className="mt-0.5 truncate text-[0.8125rem] font-medium">
        {isHq(user) ? "Headquarters" : outlet ? `${outlet.name} · ${outlet.code}` : " "}
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-5 p-3">
      <div className="flex items-center justify-between px-1.5 pt-1.5">
        <Wordmark />
        <ConnectionBadge />
      </div>
      <Context />
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          showCommandPalette();
        }}
        className="flex h-9 items-center gap-2 rounded-md border bg-card px-2.5 text-[0.8125rem] text-muted-foreground shadow-(--shadow-sm) transition-colors hover:text-foreground"
      >
        <Search className="size-3.5" aria-hidden="true" />
        Search
        <span className="ml-auto flex gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <Navigation {...(onNavigate ? { onNavigate } : {})} />
      <div className="mt-auto">
        <UserMenu />
      </div>
    </div>
  );
}

/** A thin progress bar while a lazily loaded page or its data is on the way. */
function NavigationProgress() {
  const navigation = useNavigation();
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-70 h-0.5 origin-left bg-primary transition-[scale,opacity] ease-(--ease-ui)",
        navigation.state === "loading"
          ? "scale-x-75 opacity-100 duration-[2s]"
          : "scale-x-100 opacity-0 duration-300",
      )}
    />
  );
}

export function AppShell() {
  const user = useSessionUser();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  useLiveUpdates(true);

  return (
    <div className="flex min-h-dvh">
      <NavigationProgress />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur lg:hidden">
          <Wordmark />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={showCommandPalette} aria-label="Search">
              <Search />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <MenuIcon />
            </Button>
          </div>
        </header>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent className="max-w-72 bg-sidebar">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Keyed by path: each page enters with a short fade and rise. */}
        <main
          key={location.pathname}
          id="main"
          className="flex-1 animate-in duration-(--motion-slow) ease-(--ease-ui) fade-in slide-in-from-bottom-1"
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette key={user.id} />
    </div>
  );
}
