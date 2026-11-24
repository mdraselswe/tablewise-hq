import { Compass, RotateCw, TriangleAlert } from "lucide-react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import { Button } from "@/components/ui/button.tsx";
import { buttonVariants } from "@/components/ui/button-variants.ts";
import { EmptyState } from "@/components/ui/misc.tsx";

export function NotFoundPage() {
  return (
    <EmptyState icon={<Compass />} title="This page does not exist" className="min-h-[60vh]">
      <p>The link may be old, or the page moved.</p>
      <Link to="/" className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4" })}>
        Go to your home page
      </Link>
    </EmptyState>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  // A new deploy replaced the chunk this tab still points at: reloading fetches the new build.
  const staleChunk =
    error instanceof TypeError &&
    /dynamically imported module|Importing a module script/i.test(error.message);
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : staleChunk
      ? "A new version of Tablewise is available."
      : "Something went wrong while showing this page.";
  return (
    <EmptyState icon={<TriangleAlert />} title={message} className="min-h-dvh">
      <p>Reload to continue. Your data is safe on the server.</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>
        <RotateCw />
        Reload
      </Button>
    </EmptyState>
  );
}
