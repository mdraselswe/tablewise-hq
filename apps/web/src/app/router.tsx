import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/layout/app-shell.tsx";
import { PageFallback } from "@/components/layout/page.tsx";
import { LoginPage } from "@/features/auth/login-page.tsx";
import { NotFoundPage, RouteErrorPage } from "./error-pages.tsx";
import { GuestOnly, HomeRedirect, RequireRole, RequireSession } from "./guards.tsx";

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
                children: [],
              },
              {
                path: "outlet",
                element: <RequireRole role="OUTLET_STAFF" />,
                children: [],
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
