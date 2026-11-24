import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Boxes, MapPin, Pencil, ReceiptText, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { outletsQuery, revenueQuery } from "@/api/resources.ts";
import { Page } from "@/components/layout/page.tsx";
import { Badge, StatusDot } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { buttonVariants } from "@/components/ui/button-variants.ts";
import { Card, EmptyState, FlashOnChange, Skeleton } from "@/components/ui/misc.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { NotFoundPage } from "@/app/error-pages.tsx";
import { InventoryPanel } from "@/features/inventory/inventory-panel.tsx";
import { rangeFor } from "@/lib/date-range.ts";
import { formatCount, formatMoney } from "@/lib/format.ts";
import { AssignmentsPanel } from "./assignments-panel.tsx";
import { OutletDialog } from "./outlet-dialog.tsx";

const TABS = ["menu", "inventory"] as const;
type Tab = (typeof TABS)[number];

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-1 text-xl font-semibold tracking-tight">
        <FlashOnChange value={value}>{value}</FlashOnChange>
      </div>
      <div className="num text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}

export default function OutletDetailPage() {
  const { outletId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "menu";
  const [editing, setEditing] = useState(false);
  const outlets = useQuery(outletsQuery);
  const outlet = outlets.data?.find((candidate) => candidate.id === outletId);
  const today = useQuery({ ...revenueQuery({ ...rangeFor("today"), outletId }), enabled: Boolean(outlet) });
  const week = useQuery({ ...revenueQuery({ ...rangeFor("7d"), outletId }), enabled: Boolean(outlet) });

  if (outlets.isPending) {
    return (
      <div className="mx-auto max-w-7xl px-8 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-8 h-96 rounded-xl" />
      </div>
    );
  }
  if (!outlet) return <NotFoundPage />;

  const t = today.data?.totals;
  const w = week.data?.totals;

  return (
    <Page
      title={
        <span className="flex items-center gap-3">
          {outlet.name}
          <Badge tone="outline" className="font-mono text-xs">
            {outlet.code}
          </Badge>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link to="/hq/outlets" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> All outlets
          </Link>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {outlet.address ?? "No address"}
          </span>
          <StatusDot tone={outlet.isActive ? "success" : "neutral"}>
            {outlet.isActive ? "Open" : "Closed"}
          </StatusDot>
        </span>
      }
      actions={
        <>
          <Link to={`/hq/sales?outlet=${outlet.id}`} className={buttonVariants({ variant: "outline" })}>
            <ReceiptText />
            Sales
          </Link>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil />
            Edit outlet
          </Button>
        </>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Revenue today"
          value={formatMoney(t?.revenueMinor ?? 0, { whole: true })}
          sub={`${formatCount(t?.saleCount ?? 0)} sales`}
        />
        <Stat
          label="Average ticket today"
          value={formatMoney(t?.averageTicketMinor ?? 0, { whole: true })}
          sub={`${formatCount(t?.itemsSold ?? 0)} items sold`}
        />
        <Stat
          label="Revenue, 7 days"
          value={formatMoney(w?.revenueMinor ?? 0, { whole: true })}
          sub={`${formatCount(w?.saleCount ?? 0)} sales`}
        />
        <Stat
          label="Average ticket, 7 days"
          value={formatMoney(w?.averageTicketMinor ?? 0, { whole: true })}
          sub={`${formatCount(w?.itemsSold ?? 0)} items sold`}
        />
      </div>

      {!outlet.isActive ? (
        <Card className="mb-6">
          <EmptyState title="This outlet is closed" className="py-6">
            Its tills reject new sales. Open it again from Edit outlet.
          </EmptyState>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setParams({ tab: String(value) }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="menu">
            <UtensilsCrossed /> Menu and pricing
          </TabsTrigger>
          <TabsTrigger value="inventory">
            <Boxes /> Inventory
          </TabsTrigger>
        </TabsList>
        <TabsContent value="menu">
          <AssignmentsPanel outletId={outlet.id} />
        </TabsContent>
        <TabsContent value="inventory">
          <InventoryPanel outletId={outlet.id} timeZone={outlet.timezone} />
        </TabsContent>
      </Tabs>
      <OutletDialog state={editing ? { mode: "edit", outlet } : null} onClose={() => setEditing(false)} />
    </Page>
  );
}
