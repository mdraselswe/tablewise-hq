import { useQuery } from "@tanstack/react-query";
import { outletsQuery } from "@/api/resources.ts";
import { Page } from "@/components/layout/page.tsx";
import { useSessionUser } from "@/features/auth/session.ts";
import { InventoryPanel } from "./inventory-panel.tsx";

export default function InventoryPage() {
  const user = useSessionUser();
  const outletId = user.outletId ?? "";
  const outlets = useQuery(outletsQuery);
  const outlet = outlets.data?.find((candidate) => candidate.id === outletId);
  return (
    <Page title="Inventory" description={outlet ? `Stock at ${outlet.name}` : "Stock at your outlet"}>
      <InventoryPanel outletId={outletId} {...(outlet ? { timeZone: outlet.timezone } : {})} />
    </Page>
  );
}
