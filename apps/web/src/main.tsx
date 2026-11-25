import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/globals.css";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { keys } from "./api/keys.ts";
import { router } from "./app/router.tsx";
import { Toaster } from "./components/ui/toaster.tsx";
import { TooltipProvider } from "./components/ui/misc.tsx";
import { ApiError, onUnauthenticated } from "./lib/api.ts";
import { toast } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Live events keep data fresh, so a tab switch does not need to refetch everything.
      refetchOnWindowFocus: false,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
  mutationCache: new MutationCache({
    // One place shows failed writes. A mutation that handles its own errors sets meta.silent.
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.["silent"]) return;
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Try again.");
    },
  }),
});

// Session expired on the server: drop the user and let the guard send them to sign in.
onUnauthenticated(() => queryClient.setQueryData(keys.session, null));

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={300}>
        {/* JS-driven motion (slides, scales, layout moves) follows the OS setting like the CSS does. */}
        <MotionConfig reducedMotion="user">
          <RouterProvider router={router} />
        </MotionConfig>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
