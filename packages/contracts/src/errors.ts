/** Stable, machine-readable error codes. Clients branch on `code`, never on `message`. */
export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  ITEMS_NOT_SELLABLE: "ITEMS_NOT_SELLABLE",
  OUTLET_INACTIVE: "OUTLET_INACTIVE",
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface StockShortfall {
  menuItemId: string;
  requested: number;
  available: number;
}

export interface ValidationIssue {
  path: string;
  message: string;
}
