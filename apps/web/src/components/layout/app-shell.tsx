import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ChevronsUpDown, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigation } from "react-router";
import { outletsQuery } from "@/api/resources.ts";
import { type NavItem, navFor } from "@/app/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu.tsx";
import { Kbd, Tooltip } from "@/components/ui/misc.tsx";
import { isHq, useLogout, useSessionUser } from "@/features/auth/session.ts";
import { showCommandPalette } from "@/features/command/command-bus.ts";
import { CommandPalette } from "@/features/command/command-palette.tsx";
import { type ConnectionState, useConnectionState } from "@/features/realtime/live-store.ts";
import { useLiveUpdates } from "@/features/realtime/use-live-updates.ts";
import { setSidebarCollapsed, useSidebarCollapsed } from "@/hooks/use-sidebar.ts";
import { toggleTheme, useTheme } from "@/hooks/use-theme.ts";
import { initials } from "@/lib/format.ts";
import { BrandMark, Wordmark } from "./brand.tsx";

const CONNECTION_COPY: Record<ConnectionState, { label: string; className: string }> = {
  live: { label: "Live", className: "text-success" },
  connecting: { label: "Connecting", className: "text-warning" },
  offline: { label: "Offline", className: "text-destructive" },
};

function ConnectionBadge({ className }: { className?: string }) {
  const connection = useConnectionState();
  const copy = CONNECTION_COPY[connection];
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium text-muted-foreground",
        className,
      )}
      aria-live="polite"
    >
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

/** Sun and moon swap with a short turn, so the change of theme is felt as well as seen. */
function ThemeButton() {
  const theme = useTheme();
  const dark = theme === "dark";
  return (
    <Tooltip content={dark ? "Light theme" : "Dark theme"} side="bottom">
      <Button
        variant="outline"
        size="icon"
        onClick={toggleTheme}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        className="overflow-hidden"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="grid place-items-center"
          >
            {dark ? <Sun /> : <Moon />}
          </motion.span>
        </AnimatePresence>
      </Button>
    </Tooltip>
  );
}

function SearchButton({ className }: { className?: string }) {
  // Outlet staff cannot search outlets or the master menu, so do not promise it.
  const hq = isHq(useSessionUser());
  return (
    <button
      type="button"
      onClick={showCommandPalette}
      className={cn(
        "flex h-(--control-h) min-w-0 items-center gap-2 rounded-md border bg-card px-3 text-[0.8125rem] whitespace-nowrap text-muted-foreground shadow-(--shadow-sm) transition-colors duration-(--motion-fast) hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left">
        {hq ? "Search items, outlets, pages…" : "Search pages and actions…"}
      </span>
      <span className="flex shrink-0 gap-0.5" aria-hidden="true">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

/** Shows a tooltip with the label only while the sidebar is collapsed and the label is hidden. */
function CollapsedTip({ show, label, children }: { show: boolean; label: string; children: ReactNode }) {
  return show ? (
    <Tooltip content={label} side="right">
      <span className="grid">{children}</span>
    </Tooltip>
  ) : (
    <span className="grid">{children}</span>
  );
}

/** A label that fades and narrows away when the sidebar collapses. */
function SideLabel({
  collapsed,
  children,
  className,
}: {
  collapsed: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "min-w-0 truncate transition-[opacity,max-width] duration-(--motion-base) ease-(--ease-ui)",
        collapsed ? "max-w-0 opacity-0" : "max-w-48 opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SideNavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <CollapsedTip show={collapsed} label={item.label}>
      <NavLink
        to={item.to}
        end={item.end ?? false}
        aria-label={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-(--motion-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
            isActive
              ? "text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive ? (
              <motion.span
                layoutId="side-nav-active"
                className="absolute inset-0 rounded-lg bg-accent"
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              />
            ) : null}
            <item.icon className="relative size-[1.125rem] shrink-0" aria-hidden="true" />
            <SideLabel collapsed={collapsed} className="relative">
              {item.label}
            </SideLabel>
          </>
        )}
      </NavLink>
    </CollapsedTip>
  );
}

function UserMenu({ compact = false, side = "top" }: { compact?: boolean; side?: "top" | "bottom" }) {
  const user = useSessionUser();
  const logout = useLogout();
  const theme = useTheme();
  return (
    <Menu>
      <MenuTrigger
        aria-label="Account"
        render={
          <button
            type="button"
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-lg text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40 aria-expanded:bg-muted",
              compact ? "p-1" : "w-full p-1.5",
            )}
          />
        }
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials(user.fullName)}
        </span>
        {compact ? null : (
          <>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-[0.8125rem] font-medium">{user.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </>
        )}
      </MenuTrigger>
      <MenuContent side={side} align={compact ? "end" : "start"} className="w-60">
        <MenuLabel>
          <span className="block truncate text-foreground">{user.fullName}</span>
          <span className="block truncate">{isHq(user) ? "HQ administrator" : "Outlet staff"}</span>
        </MenuLabel>
        <MenuSeparator />
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

/** Where the signed-in user works: Headquarters, or their outlet's name and code. */
function useWorkplace(): { kind: string; name: string; code: string } {
  const user = useSessionUser();
  const outlets = useQuery({ ...outletsQuery, enabled: !isHq(user) });
  if (isHq(user)) return { kind: "Workspace", name: "Headquarters", code: "HQ" };
  const outlet = outlets.data?.find((candidate) => candidate.id === user.outletId);
  return { kind: "Outlet", name: outlet?.name ?? " ", code: outlet?.code ?? "" };
}

function Sidebar() {
  const user = useSessionUser();
  const collapsed = useSidebarCollapsed();
  const workplace = useWorkplace();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-(--motion-base) ease-(--ease-ui) lg:flex",
        collapsed ? "w-(--sidebar-w-collapsed)" : "w-(--sidebar-w)",
      )}
    >
      <div className="flex h-16 items-center gap-3 overflow-hidden px-[1.0625rem]">
        <BrandMark className="size-8 shrink-0" />
        <SideLabel collapsed={collapsed} className="text-base font-semibold tracking-tight">
          Tablewise
        </SideLabel>
      </div>

      <div className="px-3">
        <CollapsedTip show={collapsed} label={`${workplace.kind}: ${workplace.name}`}>
          <div className="flex h-12 items-center gap-3 overflow-hidden rounded-lg border px-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-[0.6875rem] font-semibold text-accent-foreground">
              {workplace.code.slice(0, 3)}
            </span>
            <SideLabel collapsed={collapsed} className="grid leading-tight">
              <span className="text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
                {workplace.kind}
              </span>
              <span className="truncate text-[0.8125rem] font-medium">{workplace.name}</span>
            </SideLabel>
          </div>
        </CollapsedTip>
      </div>

      <nav aria-label="Main" className="mt-5 grid gap-1 px-3">
        {navFor(user).map((item) => (
          <SideNavLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="mt-auto grid gap-1 border-t p-3">
        <CollapsedTip show={collapsed} label="Expand sidebar">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[1.125rem] shrink-0" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-[1.125rem] shrink-0" aria-hidden="true" />
            )}
            <SideLabel collapsed={collapsed}>Collapse</SideLabel>
          </button>
        </CollapsedTip>
        <UserMenu compact={collapsed} />
      </div>
    </aside>
  );
}

/** Desktop: search, live status and theme. Phones: brand, search, theme and the account menu. */
function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-(--shell-top) items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <Wordmark className="lg:hidden" />
      <SearchButton className="hidden w-80 lg:flex" />
      <div className="ml-auto flex items-center gap-2">
        <ConnectionBadge className="hidden sm:inline-flex" />
        <Button
          variant="ghost"
          size="icon"
          onClick={showCommandPalette}
          aria-label="Search"
          className="lg:hidden"
        >
          <Search />
        </Button>
        <ThemeButton />
        <div className="lg:hidden">
          <UserMenu compact side="bottom" />
        </div>
      </div>
    </header>
  );
}

/** Phones and tablets: the main sections one thumb-tap away. */
function TabBar() {
  const user = useSessionUser();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-xl items-stretch px-2">
        {navFor(user).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) =>
              cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors outline-none focus-visible:text-foreground",
                isActive ? "text-accent-foreground" : "text-muted-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative grid h-8 w-14 place-items-center">
                  {isActive ? (
                    <motion.span
                      layoutId="tab-bar-active"
                      className="absolute inset-0 rounded-full bg-accent"
                      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    />
                  ) : null}
                  <item.icon className="relative size-5" aria-hidden="true" />
                </span>
                <span className="max-w-full truncate">{item.short}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
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
  useLiveUpdates(true);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-80 rounded-md bg-card px-3 py-2 shadow-(--shadow-overlay) focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <NavigationProgress />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* Keyed by path: each page enters with a short fade and rise. */}
        <main
          key={location.pathname}
          id="main"
          className="flex-1 animate-in pb-(--shell-bottom) duration-(--motion-slow) ease-(--ease-ui) fade-in slide-in-from-bottom-1"
        >
          <Outlet />
        </main>
      </div>
      <TabBar />
      <CommandPalette key={user.id} />
    </div>
  );
}
