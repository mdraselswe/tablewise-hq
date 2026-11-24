import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type {
  AdjustStockRequest,
  CreateMenuItemRequest,
  CreateOutletRequest,
  CreateSaleRequest,
  KitchenTicket,
  LoginResponse,
  MenuItem,
  Outlet,
  OutletAssignment,
  OutletMenuItem,
  CursorPage,
  Paginated,
  RevenueReport,
  RevenueTrend,
  Sale,
  SaleSummary,
  SessionUser,
  StockLevel,
  StockMovement,
  StockReason,
  TicketStatus,
  TopItemsReport,
  UpdateMenuItemRequest,
  UpdateOutletRequest,
  UpsertAssignmentRequest,
} from "@tablewise/contracts";
import { IDEMPOTENCY_KEY_HEADER } from "@tablewise/contracts";
import { ApiError, http, request } from "@/lib/api.ts";
import { keys } from "./keys.ts";

/*
 * Typed endpoints, grouped like the backend modules. Screens never build URLs;
 * they use these query options and calls, so an endpoint that moves to another
 * service changes in one place.
 */

// ---- identity ------------------------------------------------------------------

export const sessionQuery = queryOptions({
  queryKey: keys.session,
  queryFn: async () => {
    try {
      return await http.get<SessionUser>("/auth/me");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
});

export const authApi = {
  login: (email: string, password: string) =>
    http.post<LoginResponse>("/auth/login", { email, password }).then((response) => response.data),
  logout: () => http.post<unknown>("/auth/logout").then(() => undefined),
};

// ---- outlets -------------------------------------------------------------------

export const outletsQuery = queryOptions({
  queryKey: keys.outlets.all,
  queryFn: ({ signal }) => http.get<Outlet[]>("/outlets", undefined, signal),
  staleTime: 60_000,
});

export const outletsApi = {
  create: (body: CreateOutletRequest) =>
    http.post<Outlet>("/outlets", body).then((response) => response.data),
  update: (outletId: string, body: UpdateOutletRequest) => http.patch<Outlet>(`/outlets/${outletId}`, body),
};

// ---- catalog -------------------------------------------------------------------

export interface MenuItemsFilter {
  search?: string;
  category?: string;
  status?: "active" | "inactive" | "all";
  page?: number;
  pageSize?: number;
}

export const menuItemsQuery = (filter: MenuItemsFilter) =>
  queryOptions({
    queryKey: keys.catalog.items(filter),
    queryFn: ({ signal }) => http.get<Paginated<MenuItem>>("/menu-items", { ...filter }, signal),
    placeholderData: (previous) => previous,
  });

/** The master menu one page at a time, for lists that offer "Load more" instead of page numbers. */
export const menuItemsInfiniteQuery = (filter: Omit<MenuItemsFilter, "page"> & { notAssignedTo?: string }) =>
  infiniteQueryOptions({
    queryKey: [...keys.catalog.items(filter), "infinite"] as const,
    queryFn: ({ pageParam, signal }) =>
      http.get<Paginated<MenuItem>>("/menu-items", { ...filter, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: (previous) => previous,
  });

export const menuItemQuery = (menuItemId: string) =>
  queryOptions({
    queryKey: [...keys.catalog.all, "item", menuItemId] as const,
    queryFn: ({ signal }) => http.get<MenuItem>(`/menu-items/${menuItemId}`, undefined, signal),
  });

export const categoriesQuery = queryOptions({
  queryKey: keys.catalog.categories,
  queryFn: ({ signal }) => http.get<string[]>("/menu-items/categories", undefined, signal),
  staleTime: 5 * 60_000,
});

export const assignmentsQuery = (outletId: string) =>
  queryOptions({
    queryKey: keys.catalog.assignments(outletId),
    queryFn: ({ signal }) =>
      http.get<OutletAssignment[]>(`/outlets/${outletId}/assignments`, undefined, signal),
    staleTime: 30_000,
  });

export const itemAssignmentsQuery = (menuItemId: string) =>
  queryOptions({
    queryKey: keys.catalog.itemAssignments(menuItemId),
    queryFn: ({ signal }) =>
      http.get<OutletAssignment[]>(`/menu-items/${menuItemId}/assignments`, undefined, signal),
  });

export const outletMenuQuery = (outletId: string) =>
  queryOptions({
    queryKey: keys.catalog.outletMenu(outletId),
    queryFn: ({ signal }) => http.get<OutletMenuItem[]>(`/outlets/${outletId}/menu`, undefined, signal),
    staleTime: 60_000,
  });

export const catalogApi = {
  createItem: (body: CreateMenuItemRequest) =>
    http.post<MenuItem>("/menu-items", body).then((response) => response.data),
  updateItem: (menuItemId: string, body: UpdateMenuItemRequest) =>
    http.patch<MenuItem>(`/menu-items/${menuItemId}`, body),
  assign: (outletId: string, menuItemId: string, body: UpsertAssignmentRequest) =>
    http.put<OutletAssignment>(`/outlets/${outletId}/assignments/${menuItemId}`, body),
  unassign: (outletId: string, menuItemId: string) =>
    http.delete(`/outlets/${outletId}/assignments/${menuItemId}`),
};

// ---- inventory -----------------------------------------------------------------

export const stockLevelsQuery = (outletId: string) =>
  queryOptions({
    queryKey: keys.inventory.levels(outletId),
    queryFn: ({ signal }) => http.get<StockLevel[]>(`/outlets/${outletId}/inventory`, undefined, signal),
    staleTime: 30_000,
  });

export interface MovementsFilter {
  menuItemId?: string | undefined;
  reason?: StockReason | undefined;
  days?: number;
  cursor?: string | undefined;
  pageSize?: number;
}

export const movementsQuery = (outletId: string, filter: MovementsFilter) =>
  queryOptions({
    queryKey: keys.inventory.movements(outletId, filter),
    queryFn: ({ signal }) =>
      http.get<CursorPage<StockMovement>>(`/outlets/${outletId}/inventory/movements`, { ...filter }, signal),
    placeholderData: (previous) => previous,
  });

export const inventoryApi = {
  adjust: (outletId: string, menuItemId: string, body: AdjustStockRequest) =>
    http
      .post<StockLevel>(`/outlets/${outletId}/inventory/${menuItemId}/adjustments`, body)
      .then((response) => response.data),
  setThreshold: (outletId: string, menuItemId: string, lowStockThreshold: number) =>
    http.patch<StockLevel>(`/outlets/${outletId}/inventory/${menuItemId}`, { lowStockThreshold }),
};

// ---- sales ---------------------------------------------------------------------

export interface SalesFilter {
  outletId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  pageSize?: number;
}

export const salesQuery = (filter: SalesFilter) =>
  queryOptions({
    queryKey: keys.sales.list(filter),
    queryFn: ({ signal }) => http.get<CursorPage<SaleSummary>>("/sales", { ...filter }, signal),
    placeholderData: (previous) => previous,
  });

export const saleQuery = (saleId: string) =>
  queryOptions({
    queryKey: keys.sales.detail(saleId),
    queryFn: ({ signal }) => http.get<Sale>(`/sales/${saleId}`, undefined, signal),
    staleTime: Number.POSITIVE_INFINITY, // a completed sale never changes
  });

export const salesApi = {
  /** The key makes retries safe: the server returns the first sale instead of charging twice. */
  create: async (outletId: string, body: CreateSaleRequest, idempotencyKey: string) => {
    const response = await request<Sale>("POST", `/outlets/${outletId}/sales`, {
      body,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    });
    return { sale: response.data, replayed: response.headers.get("Idempotent-Replayed") === "true" };
  },
};

// ---- kitchen -------------------------------------------------------------------

export const kitchenQuery = (outletId: string) =>
  queryOptions({
    queryKey: keys.kitchen.board(outletId),
    queryFn: ({ signal }) =>
      http.get<KitchenTicket[]>(`/outlets/${outletId}/kitchen/tickets`, { scope: "active" }, signal),
  });

export const kitchenApi = {
  move: (ticketId: string, status: TicketStatus) =>
    http.patch<KitchenTicket>(`/kitchen/tickets/${ticketId}`, { status }),
};

// ---- reporting -----------------------------------------------------------------

export interface ReportFilter {
  from: string;
  to: string;
  outletId?: string | undefined;
}

export const revenueQuery = (filter: ReportFilter) =>
  queryOptions({
    queryKey: keys.reports.revenue(filter),
    queryFn: ({ signal }) => http.get<RevenueReport>("/reports/revenue", { ...filter }, signal),
    placeholderData: (previous) => previous,
  });

export const topItemsQuery = (filter: ReportFilter & { limit?: number }) =>
  queryOptions({
    queryKey: keys.reports.topItems(filter),
    queryFn: ({ signal }) => http.get<TopItemsReport>("/reports/top-items", { ...filter }, signal),
    placeholderData: (previous) => previous,
  });

export const trendQuery = (filter: ReportFilter) =>
  queryOptions({
    queryKey: keys.reports.trend(filter),
    queryFn: ({ signal }) => http.get<RevenueTrend>("/reports/revenue-trend", { ...filter }, signal),
    placeholderData: (previous) => previous,
  });
