import type { Role } from "@tablewise/contracts";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router";
import { sessionQuery } from "@/api/resources.ts";
import { BrandMark } from "@/components/layout/brand.tsx";
import { homePath } from "@/features/auth/session.ts";

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading">
      <BrandMark className="size-9 animate-pulse" />
    </div>
  );
}

/** Lets a signed-in user through; anyone else goes to the sign-in page and comes back afterwards. */
export function RequireSession() {
  const session = useQuery(sessionQuery);
  const location = useLocation();
  if (session.isPending) return <Splash />;
  if (!session.data) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}

/** Sends a user who opens the other role's area to their own home. The API enforces the same rule. */
export function RequireRole({ role }: { role: Role }) {
  const session = useQuery(sessionQuery);
  if (!session.data) return null;
  if (session.data.role !== role) return <Navigate to={homePath(session.data)} replace />;
  return <Outlet />;
}

export function GuestOnly() {
  const session = useQuery(sessionQuery);
  if (session.isPending) return <Splash />;
  if (session.data) return <Navigate to={homePath(session.data)} replace />;
  return <Outlet />;
}

export function HomeRedirect() {
  const session = useQuery(sessionQuery);
  if (!session.data) return null;
  return <Navigate to={homePath(session.data)} replace />;
}
