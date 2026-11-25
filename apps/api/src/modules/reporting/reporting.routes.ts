import { ReportQuery, TopItemsQuery } from "@tablewise/contracts";
import { route, type RouteDefinition } from "@/platform/http/route.ts";
import type { ReportingController } from "./reporting.controller.ts";

const RANGE_NOTE =
  "Dates are trading days (YYYY-MM-DD) in the outlet's time zone; the default is the last 7 days, today included. HQ may filter by outlet; outlet staff always get their own outlet.";

export function reportingRoutes(controller: ReportingController): RouteDefinition[] {
  return [
    route({
      method: "get",
      path: "/reports/revenue",
      summary: "Total revenue by outlet",
      description: `Revenue, sale count, items sold and average ticket per outlet, plus totals. ${RANGE_NOTE}`,
      query: ReportQuery,
      handler: controller.revenue,
    }),
    route({
      method: "get",
      path: "/reports/top-items",
      summary: "Top selling items per outlet",
      description: `Top items by quantity sold in each outlet (default 5, max 20). ${RANGE_NOTE}`,
      query: TopItemsQuery,
      handler: controller.topItems,
    }),
    route({
      method: "get",
      path: "/reports/revenue-trend",
      summary: "Daily revenue series",
      description: `One point per day (default: the last 14 days), zero-filled. ${RANGE_NOTE}`,
      query: ReportQuery,
      handler: controller.trend,
    }),
  ];
}
