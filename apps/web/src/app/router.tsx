import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/layout/app-shell.tsx";
import { PageFallback } from "@/components/layout/page.tsx";
import { LoginPage } from "@/features/auth/login-page.tsx";
import { NotFoundPage, RouteErrorPage } from "./error-pages.tsx";
import { GuestOnly, HomeRedirect, RequireRole, RequireSession } from "./guards.tsx";

/*
 * Every page is its own chunk (route.lazy), so the POS never downloads the HQ
 * dashboard and the first screen stays small. The router keeps the current page
 * on screen until the next one is ready, which feels instant.
 */
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <PageFallback />,
    children: [
      { element: <GuestOnly />, children: [{ path: "/login", element: <LoginPage /> }] },
      {
        element: <RequireSession />,
        children: [
          { index: true, element: <HomeRedirect /> },
          {
            element: <AppShell />,
            children: [
              {
                path: "hq",
                element: <RequireRole role="HQ_ADMIN" />,
                children: [
                  { index: true, lazy: page(() => import("@/features/dashboard/dashboard-page.tsx")) },
                  { path: "outlets", lazy: page(() => import("@/features/outlets/outlets-page.tsx")) },
                  {
                    path: "outlets/:outletId",
                    lazy: page(() => import("@/features/outlets/outlet-detail-page.tsx")),
                  },
                  { path: "menu", lazy: page(() => import("@/features/menu/menu-page.tsx")) },
                ],
              },
              {
                path: "outlet",
                element: <RequireRole role="OUTLET_STAFF" />,
                children: [
                  { path: "inventory", lazy: page(() => import("@/features/inventory/inventory-page.tsx")) },
                ],
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
