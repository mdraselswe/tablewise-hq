import { z } from "zod";
import { DateRangeShape, Id, isOrderedRange, RANGE_ORDER_ISSUE } from "./common.ts";

const ReportQueryShape = {
  ...DateRangeShape,
  outletId: Id.optional(),
};

export const ReportQuery = z.object(ReportQueryShape).refine(isOrderedRange, RANGE_ORDER_ISSUE);
export type ReportQuery = z.output<typeof ReportQuery>;

export const TopItemsQuery = z
  .object({
    ...ReportQueryShape,
    limit: z.coerce.number().int().min(1).max(20).default(5),
  })
  .refine(isOrderedRange, RANGE_ORDER_ISSUE);
export type TopItemsQuery = z.output<typeof TopItemsQuery>;

export interface ReportRange {
  from: string;
  to: string;
}

export interface OutletRevenue {
  outletId: string;
  outletCode: string;
  outletName: string;
  revenueMinor: number;
  saleCount: number;
  itemsSold: number;
  averageTicketMinor: number;
}

export interface RevenueReport {
  range: ReportRange;
  totals: Omit<OutletRevenue, "outletId" | "outletCode" | "outletName">;
  outlets: OutletRevenue[];
}

export interface TopItem {
  rank: number;
  menuItemId: string;
  sku: string;
  itemName: string;
  quantity: number;
  revenueMinor: number;
}

export interface OutletTopItems {
  outletId: string;
  outletCode: string;
  outletName: string;
  items: TopItem[];
}

export interface TopItemsReport {
  range: ReportRange;
  outlets: OutletTopItems[];
}

export interface RevenueTrendPoint {
  date: string;
  revenueMinor: number;
  saleCount: number;
}

export interface RevenueTrend {
  range: ReportRange;
  points: RevenueTrendPoint[];
}
